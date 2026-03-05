import { callClaudeStructured } from "./client";
import { ONBOARDING_SYSTEM_PROMPT } from "./prompts";
import type { OnboardingAnswers, MemoryProfile } from "@ally/shared";

interface OnboardingResult {
  greeting: string;
  memoryProfile: Partial<MemoryProfile>;
  briefingTime: string;
}

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
