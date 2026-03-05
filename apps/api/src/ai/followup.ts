import { callClaudeStructured } from "./client";
import { FOLLOWUP_SYSTEM_PROMPT } from "./prompts";
import type { DetectedFollowup, Message, MemoryProfile } from "@ally/shared";

interface FollowupResult {
  followups: DetectedFollowup[];
}

export async function detectFollowups(input: {
  messages: Pick<Message, "role" | "content" | "createdAt">[];
  profile: MemoryProfile | null;
}): Promise<{ data: FollowupResult; tokensUsed: number }> {
  const conversationText = input.messages
    .map(
      (m) =>
        `[${m.role === "user" ? "User" : "Ally"}] ${m.content}`,
    )
    .join("\n");

  const goalsContext = input.profile
    ? `Active goals:\n${input.profile.goals
        .filter((g) => g.status === "active")
        .map((g) => `- ${g.description}`)
        .join("\n")}`
    : "";

  return callClaudeStructured<FollowupResult>({
    system: FOLLOWUP_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Recent conversations:\n${conversationText}\n\n${goalsContext}`,
      },
    ],
    maxTokens: 1536,
  });
}
