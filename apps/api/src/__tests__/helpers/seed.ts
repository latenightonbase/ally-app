import { db, schema } from "../../db";
import { sql } from "drizzle-orm";
import type { MemoryProfile } from "@ally/shared";
import { TEST_USER, TEST_FREE_USER, TEST_PREMIUM_USER } from "./jwt";

export async function truncateAll() {
  // Build the truncate list dynamically from what actually exists in the DB,
  // so this works across schema versions and test branches.
  const wanted = new Set([
    "job_runs",
    "weekly_insights",
    "briefings",
    "memory_events",
    "memory_episodes",
    "memory_facts",
    "memory_profiles",
    "messages",
    "conversations",
    "user",
    "users",
    "session",
    "account",
    "verification",
  ]);

  const existing = await db.execute<{ tablename: string }>(
    sql.raw(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (${[...wanted].map((t) => `'${t}'`).join(",")})`,
    ),
  );

  if (existing.length === 0) return;

  const tableList = existing
    .map((r) => `"${r.tablename}"`)
    .join(", ");

  await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} CASCADE`));
}

export async function seedUsers() {
  await db.insert(schema.user).values([
    { id: TEST_USER.id, email: TEST_USER.email, name: TEST_USER.name, tier: TEST_USER.tier },
    { id: TEST_FREE_USER.id, email: TEST_FREE_USER.email, name: TEST_FREE_USER.name, tier: TEST_FREE_USER.tier },
    { id: TEST_PREMIUM_USER.id, email: TEST_PREMIUM_USER.email, name: TEST_PREMIUM_USER.name, tier: TEST_PREMIUM_USER.tier },
  ]).onConflictDoNothing();
}

export async function seedConversation(userId: string, messageCount = 3) {
  const [conv] = await db
    .insert(schema.conversations)
    .values({ userId, preview: "Test conversation", messageCount })
    .returning();

  const messages = [];
  for (let i = 0; i < messageCount; i++) {
    const role = i % 2 === 0 ? "user" : "ally";
    const [msg] = await db
      .insert(schema.messages)
      .values({
        conversationId: conv.id,
        role: role as "user" | "ally",
        content: `Test message ${i + 1}`,
      })
      .returning();
    messages.push(msg);
  }

  return { conversation: conv, messages };
}

export async function seedMemoryProfile(userId: string) {
  const profile: MemoryProfile = {
    userId,
    version: 2,
    personalInfo: {
      preferredName: "Test",
      fullName: "Test User",
      age: null,
      birthday: null,
      location: "San Francisco",
      livingSituation: null,
      other: {},
    },
    relationships: [
      { name: "Maya", relation: "best friend", notes: "Coworker", lastMentioned: null },
    ],
    work: {
      role: "Engineer",
      company: "TestCo",
      companyType: null,
      currentProjects: [],
      currentGoals: ["Ship v2"],
      stressors: ["Deadlines"],
      colleagues: [],
    },
    health: {
      fitnessGoals: [],
      currentRoutine: null,
      sleepNotes: null,
      dietNotes: null,
      mentalHealthNotes: null,
      other: {},
    },
    interests: [
      { topic: "coding", detail: null, firstMentioned: new Date().toISOString() },
      { topic: "music", detail: null, firstMentioned: new Date().toISOString() },
    ],
    goals: [
      {
        description: "Ship v2",
        category: "career",
        status: "active" as const,
        progressNotes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    emotionalPatterns: {
      primaryStressors: ["Deadlines"],
      copingMechanisms: ["Running"],
      moodTrends: [],
      recurringThemes: [],
      sensitivities: [],
    },
    pendingFollowups: [],
    updatedAt: new Date().toISOString(),
  };

  await db
    .insert(schema.memoryProfiles)
    .values({ userId, profile })
    .onConflictDoNothing();

  return profile;
}

export async function seedMemoryFact(userId: string, overrides: Partial<{
  content: string;
  category: "personal_info" | "relationships" | "work" | "health" | "interests" | "goals" | "emotional_patterns";
  importance: number;
  confidence: number;
  supersededBy: string | null;
}> = {}) {
  const [fact] = await db
    .insert(schema.memoryFacts)
    .values({
      userId,
      content: overrides.content ?? "Test fact about user",
      category: overrides.category ?? "work",
      importance: overrides.importance ?? 0.7,
      confidence: overrides.confidence ?? 0.9,
      supersededBy: overrides.supersededBy ?? null,
    })
    .returning();

  return fact;
}

export async function seedMemoryEpisode(userId: string, overrides: Partial<{
  content: string;
  category: "personal_info" | "relationships" | "work" | "health" | "interests" | "goals" | "emotional_patterns";
  importance: number;
  daysUntilExpiry: number;
}> = {}) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (overrides.daysUntilExpiry ?? 14));

  const [episode] = await db
    .insert(schema.memoryEpisodes)
    .values({
      userId,
      content: overrides.content ?? "Test episodic memory",
      category: overrides.category ?? "work",
      importance: overrides.importance ?? 0.6,
      confidence: 0.9,
      expiresAt,
      sourceDate: new Date(),
      sourceType: "chat",
    })
    .returning();

  return episode;
}

export async function seedMemoryEvent(userId: string, overrides: Partial<{
  content: string;
  eventDate: Date;
}> = {}) {
  const eventDate = overrides.eventDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d;
  })();

  const [event] = await db
    .insert(schema.memoryEvents)
    .values({
      userId,
      content: overrides.content ?? "Test upcoming event",
      eventDate,
      sourceType: "chat",
    })
    .returning();

  return event;
}

export async function seedBriefing(userId: string, date?: string) {
  const [briefing] = await db
    .insert(schema.briefings)
    .values({
      userId,
      date: date ?? new Date().toISOString().split("T")[0],
      content: "Good morning, Test! Here is your briefing.",
      delivered: true,
    })
    .returning();

  return briefing;
}

export async function seedWeeklyInsight(
  userId: string,
  weekOf?: string,
  overrides?: Partial<{
    summary: string;
    moodTrend: string;
    topThemes: string[];
    followUpSuggestions: string[];
  }>,
) {
  const [insight] = await db
    .insert(schema.weeklyInsights)
    .values({
      userId,
      weekOf: weekOf ?? new Date().toISOString().split("T")[0],
      summary: overrides?.summary ?? "It was a steady week. You stayed focused on your goals.",
      moodTrend: overrides?.moodTrend ?? "stable",
      topThemes: overrides?.topThemes ?? ["work", "fitness"],
      followUpSuggestions: overrides?.followUpSuggestions ?? ["Check in on the project deadline"],
    })
    .returning();

  return insight;
}
