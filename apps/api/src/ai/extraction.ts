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

/**
 * Rough token estimate: ~4 chars per token for English text.
 * Used as a pre-flight guard — not meant to be perfectly accurate.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Hard cap for the profile portion of the prompt (~50k tokens ≈ 200k chars). */
const MAX_PROFILE_CHARS = 200_000;

/** Safety ceiling: if the assembled user message exceeds this, aggressively trim. */
const MAX_PROMPT_TOKENS = 150_000;

/**
 * Produce a slimmed-down copy of the memory profile that fits within
 * MAX_PROFILE_CHARS when JSON-stringified.
 *
 * Strategy: keep the structural skeleton but cap array fields (relationships,
 * interests, goals, mood trends, followups, etc.) to the most recent N items,
 * and omit bulky sub-fields like dynamicAttributes when space is tight.
 */
function truncateProfile(profile: MemoryProfile): Record<string, unknown> {
  // Start with a lean copy — keep scalar / small fields intact.
  const slim: Record<string, unknown> = {
    userId: profile.userId,
    personalInfo: profile.personalInfo,
    work: profile.work,
    health: profile.health,
    updatedAt: profile.updatedAt,
  };

  // Cap list fields to the last N entries (most recent are most relevant).
  const CAP = 30;
  slim.relationships = (profile.relationships ?? []).slice(-CAP);
  slim.interests = (profile.interests ?? []).slice(-CAP);
  slim.goals = (profile.goals ?? []).slice(-CAP);
  slim.pendingFollowups = (profile.pendingFollowups ?? []).slice(-15);

  if (profile.emotionalPatterns) {
    slim.emotionalPatterns = {
      ...profile.emotionalPatterns,
      moodTrends: (profile.emotionalPatterns.moodTrends ?? []).slice(-20),
      recurringThemes: (profile.emotionalPatterns.recurringThemes ?? []).slice(-15),
    };
  }

  // Dynamic attributes can be huge — include only if there's room.
  if (profile.dynamicAttributes) {
    const daJson = JSON.stringify(profile.dynamicAttributes);
    if (daJson.length < 20_000) {
      slim.dynamicAttributes = profile.dynamicAttributes;
    } else {
      // Keep only the 20 highest-confidence attributes
      const sorted = Object.entries(profile.dynamicAttributes)
        .sort((a, b) => b[1].confidence - a[1].confidence)
        .slice(0, 20);
      slim.dynamicAttributes = Object.fromEntries(sorted);
    }
  }

  // Final safety: if the JSON is still too large, progressively strip fields.
  const json = JSON.stringify(slim, null, 2);
  if (json.length > MAX_PROFILE_CHARS) {
    console.warn(
      `[extraction] Profile still too large after slimming (${json.length} chars). Stripping bulky fields.`,
    );
    // Drop the heaviest optional fields first
    delete slim.dynamicAttributes;
    delete slim.pendingFollowups;
    delete slim.emotionalPatterns;
    // If still too large, keep only personalInfo
    const reduced = JSON.stringify(slim, null, 2);
    if (reduced.length > MAX_PROFILE_CHARS) {
      return { userId: profile.userId, personalInfo: profile.personalInfo, updatedAt: profile.updatedAt };
    }
  }

  return slim;
}

export async function extractMemories(input: {
  messages: Pick<Message, "role" | "content" | "createdAt">[];
  existingProfile: MemoryProfile | null;
}): Promise<{ data: ExtractionResult; tokensUsed: number }> {
  const conversationText = input.messages
    .map((m) => `[${m.role === "user" ? "User" : "Anzi"}] ${m.content}`)
    .join("\n");

  let profileContext: string;
  if (input.existingProfile) {
    const slimProfile = truncateProfile(input.existingProfile);
    profileContext = `Current memory profile:\n${JSON.stringify(slimProfile, null, 2)}`;
  } else {
    profileContext = "No existing memory profile (new user).";
  }

  // Pre-flight token guard: if the assembled prompt is still too large, drop
  // the profile entirely rather than burning retries on a guaranteed failure.
  const userContent = `${profileContext}\n\nToday's conversations:\n${conversationText}`;
  const estimatedTokens = estimateTokens(userContent) + estimateTokens(EXTRACTION_SYSTEM_PROMPT);

  if (estimatedTokens > MAX_PROMPT_TOKENS) {
    console.warn(
      `[extraction] Prompt too large even after truncation (~${estimatedTokens} tokens). ` +
      `Dropping profile context to stay under limit. ` +
      `(profile: ${profileContext.length} chars, conversation: ${conversationText.length} chars)`,
    );
    // Retry with no profile — extraction will still capture new facts from the conversation.
    profileContext = "Existing memory profile omitted (too large). Extract only new facts from the conversation below.";
  }

  const finalContent = estimatedTokens > MAX_PROMPT_TOKENS
    ? `${profileContext}\n\nToday's conversations:\n${conversationText}`
    : userContent;

  const result = await callClaudeStructured<ExtractionResult>({
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: finalContent,
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
