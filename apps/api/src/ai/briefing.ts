import { callClaudeStructured } from "./client";
import { BRIEFING_SYSTEM_PROMPT } from "./prompts";
import type { MemoryProfile, MemoryFact, PendingFollowup } from "@ally/shared";

interface BriefingResult {
  content: string;
  sections: string[];
}

export async function generateBriefing(input: {
  profile: MemoryProfile;
  recentFacts: Pick<MemoryFact, "content" | "category" | "createdAt">[];
  pendingFollowups: PendingFollowup[];
  date: string;
}): Promise<{ data: BriefingResult; tokensUsed: number }> {
  const context = `User: ${input.profile.personalInfo.preferredName ?? "User"}
Date: ${input.date}

Recent memories:
${input.recentFacts.map((f) => `- [${f.category}] ${f.content}`).join("\n")}

Active goals:
${input.profile.goals
  .filter((g) => g.status === "active")
  .map((g) => `- ${g.description} (${g.category})`)
  .join("\n")}

Pending follow-ups:
${input.pendingFollowups.map((f) => `- [${f.priority}] ${f.topic}: ${f.context}`).join("\n")}`;

  return callClaudeStructured<BriefingResult>({
    system: BRIEFING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: context }],
    maxTokens: 768,
  });
}
