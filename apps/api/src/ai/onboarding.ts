import { callClaudeStructured } from "./client";
import { ONBOARDING_COMPLETE_PROMPT, ONBOARDING_DYNAMIC_PROMPT } from "./prompts";
import type {
  OnboardingQA,
  MemoryProfile,
  DynamicOnboardingQuestion,
} from "@ally/shared";

interface OnboardingResult {
  greeting: string;
  memoryProfile: Partial<MemoryProfile>;
  briefingTime: string;
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
    .map((qa) => `[Ally] ${qa.question}\n[${input.userName}] ${qa.answer}`)
    .join("\n\n");

  const userMessage = `User's name: ${input.userName}
Ally's name: ${input.allyName}

Conversation so far:
${conversationText}`;

  return callClaudeStructured<FollowupResult>({
    system: ONBOARDING_DYNAMIC_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 1024,
  });
}

/** Dynamic: process the full onboarding conversation into a memory profile + greeting */
export async function processOnboardingConversation(input: {
  userName: string;
  allyName: string;
  conversation: OnboardingQA[];
}): Promise<{ data: OnboardingResult; tokensUsed: number }> {
  const conversationText = input.conversation
    .map((qa) => `[Ally] ${qa.question}\n[${input.userName}] ${qa.answer}`)
    .join("\n\n");

  const userMessage = `The user's name is "${input.userName}" and they named their companion "${input.allyName}".

Here is the full onboarding conversation:

${conversationText}`;

  return callClaudeStructured<OnboardingResult>({
    system: ONBOARDING_COMPLETE_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 1536,
  });
}
