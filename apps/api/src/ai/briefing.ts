import { callClaude } from "./client";
import { BRIEFING_SYSTEM_PROMPT } from "./prompts";
import { retrieveRelevantFacts, loadMemoryProfile } from "../services/retrieval";
import { db, schema } from "../db";
import { eq, and, gte, lte, isNull } from "drizzle-orm";
import type { MemoryProfile, PendingFollowup } from "@ally/shared";

export async function generateBriefing(input: {
  profile: MemoryProfile;
  relevantFacts: { content: string; category: string }[];
  upcomingEvents: { content: string; eventDate: string }[];
  pendingFollowups: PendingFollowup[];
  date: string;
}): Promise<{ content: string; tokensUsed: number }> {
  const name = input.profile.personalInfo.preferredName ?? "there";

  const parts: string[] = [`User: ${name}`, `Date: ${input.date}`];

  if (input.upcomingEvents.length > 0) {
    parts.push(
      `\nUpcoming events:\n${input.upcomingEvents.map((e) => `- ${e.content} (${e.eventDate})`).join("\n")}`,
    );
  }

  if (input.pendingFollowups.length > 0) {
    parts.push(
      `\nPending follow-ups:\n${input.pendingFollowups.map((f) => `- [${f.priority}] ${f.topic}: ${f.context}`).join("\n")}`,
    );
  }

  if (input.relevantFacts.length > 0) {
    parts.push(
      `\nRelevant context:\n${input.relevantFacts.map((f) => `- [${f.category}] ${f.content}`).join("\n")}`,
    );
  }

  const activeGoals = input.profile.goals.filter((g) => g.status === "active");
  if (activeGoals.length > 0) {
    parts.push(
      `\nActive goals:\n${activeGoals.map((g) => `- ${g.description} (${g.category})`).join("\n")}`,
    );
  }

  const { text, tokensUsed } = await callClaude({
    system: BRIEFING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: parts.join("\n") }],
    maxTokens: 512,
  });

  return { content: text, tokensUsed };
}

/**
 * Ensure a briefing exists for userId today. Creates one if missing.
 * This is the single entry point for all briefing generation paths.
 * Returns the briefing row, or null if the user is ineligible.
 */
export async function ensureBriefingForUser(userId: string): Promise<
  | {
      id: string;
      date: string;
      content: string;
      delivered: boolean;
      createdAt: string;
    }
  | null
> {
  const today = new Date().toISOString().split("T")[0];

  const existing = await db.query.briefings.findFirst({
    where: and(
      eq(schema.briefings.userId, userId),
      eq(schema.briefings.date, today),
    ),
  });

  if (existing) {
    return {
      id: existing.id,
      date: existing.date,
      content: existing.content,
      delivered: existing.delivered,
      createdAt: existing.createdAt.toISOString(),
    };
  }

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { tier: true },
  });
  if (!user || (user.tier !== "pro" && user.tier !== "premium")) return null;

  const profile = await loadMemoryProfile(userId);
  if (!profile) return null;

  // Use the semantic retrieval pipeline for relevant context
  const relevantFacts = await retrieveRelevantFacts({
    userId,
    query: "what's on my mind today goals check in",
    limit: 12,
  }).catch(() => [] as Awaited<ReturnType<typeof retrieveRelevantFacts>>);

  // Pull upcoming events within the next 7 days
  const now = new Date();
  const sevenDaysOut = new Date(now);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  const upcomingEvents = await db.query.memoryEvents.findMany({
    where: and(
      eq(schema.memoryEvents.userId, userId),
      gte(schema.memoryEvents.eventDate, now),
      lte(schema.memoryEvents.eventDate, sevenDaysOut),
      isNull(schema.memoryEvents.completedAt),
    ),
    columns: { content: true, eventDate: true },
    orderBy: schema.memoryEvents.eventDate,
    limit: 5,
  });

  const pendingFollowups = (profile.pendingFollowups ?? []).filter(
    (f) => !f.resolved,
  );

  const { content } = await generateBriefing({
    profile,
    relevantFacts: relevantFacts.map((f) => ({
      content: f.content,
      category: f.category ?? "general",
    })),
    upcomingEvents: upcomingEvents.map((e) => ({
      content: e.content,
      eventDate: e.eventDate.toISOString().split("T")[0],
    })),
    pendingFollowups,
    date: today,
  });

  const [inserted] = await db
    .insert(schema.briefings)
    .values({ userId, date: today, content })
    .onConflictDoNothing()
    .returning();

  if (!inserted) return null;

  return {
    id: inserted.id,
    date: inserted.date,
    content: inserted.content,
    delivered: inserted.delivered,
    createdAt: inserted.createdAt.toISOString(),
  };
}
