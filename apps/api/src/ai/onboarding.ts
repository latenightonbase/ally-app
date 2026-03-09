import { callClaudeStructured } from "./client";
import { ONBOARDING_SYSTEM_PROMPT, ONBOARDING_FOLLOWUP_PROMPT } from "./prompts";
import type {
  OnboardingAnswers,
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

/** Legacy: process the old flat onboarding answers */
export async function processOnboarding(
  answers: OnboardingAnswers,
): Promise<{ data: OnboardingResult; tokensUsed: number }> {
  const formatted = `Here are the user's onboarding answers:

1. Name and how to be greeted: "${answers.nameAndGreeting}"
2. Life context: "${answers.lifeContext}"
3. Current focus: "${answers.currentFocus}"
4. Stress and support: "${answers.stressAndSupport}"
5. What they want from Ally: "${answers.allyExpectations}"`;

  return callClaudeStructured<OnboardingResult>({
    system: ONBOARDING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: formatted }],
    maxTokens: 1024,
  });
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
    system: ONBOARDING_FOLLOWUP_PROMPT,
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
    system: ONBOARDING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 1536,
  });
}
