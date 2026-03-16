import { callClaudeStructured } from "./client";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompts";
import type { ExtractedFact, ExtractedEntity, MemoryProfile, Message } from "@ally/shared";

interface ExtractionResult {
  facts: ExtractedFact[];
  entities: ExtractedEntity[];
  followups: {
    topic: string;
    context: string;
    priority: "high" | "medium" | "low";
  }[];
  profileUpdates: Partial<MemoryProfile>;
  dynamicAttributes?: Record<string, { value: string; confidence: number }>;
}

export type { ExtractionResult };

export async function extractMemories(input: {
  messages: Pick<Message, "role" | "content" | "createdAt">[];
  existingProfile: MemoryProfile | null;
}): Promise<{ data: ExtractionResult; tokensUsed: number }> {
  const conversationText = input.messages
    .map((m) => `[${m.role === "user" ? "User" : "Anzi"}] ${m.content}`)
    .join("\n");

  const profileContext = input.existingProfile
    ? `Current memory profile:\n${JSON.stringify(input.existingProfile, null, 2)}`
    : "No existing memory profile (new user).";

  const result = await callClaudeStructured<ExtractionResult>({
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${profileContext}\n\nToday's conversations:\n${conversationText}`,
      },
    ],
    maxTokens: 2048,
  });

  const data = result.data;

  // Normalise: ensure memoryType exists on all facts (backward compat with mock responses)
  if (data.facts) {
    data.facts = data.facts.map((f) => ({
      ...f,
      memoryType: f.memoryType ?? (f.temporal ? "event" : "semantic"),
      eventDate: f.eventDate ?? null,
      supersedes: f.supersedes ?? null,
    }));
  }

  if (!data.entities) {
    data.entities = [];
  }

  if (!data.dynamicAttributes) {
    data.dynamicAttributes = undefined;
  }

  return { data, tokensUsed: result.tokensUsed };
}
