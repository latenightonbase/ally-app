import { callClaudeStructured } from "./client";
import { ONBOARDING_COMPLETE_PROMPT, ONBOARDING_DYNAMIC_PROMPT } from "./prompts";
import type {
  OnboardingQA,
  MemoryProfile,
  DynamicOnboardingQuestion,
} from "@ally/shared";

interface FamilyMemberSetup {
  name: string;
  role: string;
  age?: number;
  birthday?: string;
  school?: string;
  allergies?: string[];
  dietaryPreferences?: string[];
  notes?: string;
}

interface ActionItem {
  title: string;
  description?: string;
  dateTime?: string;
  assigneeName?: string;
  type: "event" | "todo";
  category?: string;
}

interface OnboardingResult {
  greeting: string;
  memoryProfile: Partial<MemoryProfile>;
  briefingTime: string;
  familyName?: string;
  familyMembers?: FamilyMemberSetup[];
  actionItems?: ActionItem[];
}

interface FollowupResult {
  questions: DynamicOnboardingQuestion[];
  summary: string;
  memoryUpdates: Record<string, unknown>;
}

/** Dynamic: generate followup questions based on conversation so far */
export async function generateOnboardingFollowups(input: {
  userName: string;
  allyName: string;
  conversation: OnboardingQA[];
  dynamicRound: number;
}): Promise<{ data: FollowupResult; tokensUsed: number }> {
  const conversationText = input.conversation
    .map((qa) => `[Anzi] ${qa.question}\n[${input.userName}] ${qa.answer}`)
    .join("\n\n");

  const userMessage = `User's name: ${input.userName}
Anzi's name: ${input.allyName}

Conversation so far:
${conversationText}`;

  return callClaudeStructured<FollowupResult>({
    system: ONBOARDING_DYNAMIC_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 1024,
  });
}

/** Dynamic: process the full onboarding conversation into a memory profile + greeting + family setup */
export async function processOnboardingConversation(input: {
  userName: string;
  allyName: string;
  conversation: OnboardingQA[];
  timezone?: string;
}): Promise<{ data: OnboardingResult; tokensUsed: number }> {
  const conversationText = input.conversation
    .map((qa) => `[Anzi] ${qa.question}\n[${input.userName}] ${qa.answer}`)
    .join("\n\n");

  const currentDate = new Date().toISOString();
  const userMessage = `The user's name is "${input.userName}" and they named their companion "${input.allyName}".
Current date/time: ${currentDate}
User's timezone: ${input.timezone || "UTC"}

Here is the full onboarding conversation:

${conversationText}`;

  return callClaudeStructured<OnboardingResult>({
    system: ONBOARDING_COMPLETE_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 2048,
  });
}
