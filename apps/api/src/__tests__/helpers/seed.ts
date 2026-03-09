import { db, schema } from "../../db";
import { sql } from "drizzle-orm";
import type { MemoryProfile } from "@ally/shared";
import { TEST_USER, TEST_FREE_USER, TEST_PREMIUM_USER } from "./jwt";

export async function truncateAll() {
  await db.execute(sql`
    TRUNCATE TABLE job_runs, briefings, memory_facts, memory_profiles,
                   messages, conversations, "user", session, account, verification
    CASCADE
  `);
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
}> = {}) {
  const [fact] = await db
    .insert(schema.memoryFacts)
    .values({
      userId,
      content: overrides.content ?? "Test fact about user",
      category: overrides.category ?? "work",
      importance: overrides.importance ?? 0.7,
      confidence: overrides.confidence ?? 0.9,
      embedding: new Array(1024).fill(0),
    })
    .returning();

  return fact;
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
