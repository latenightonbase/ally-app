import { db, schema } from "../../db";
import { sql } from "drizzle-orm";
import { deleteMemoriesForUser } from "../../services/vectorStore";
import type { MemoryProfile } from "@ally/shared";

export const E2E_USER_ID = "00000000-0000-0000-0000-e2e000000001";
export const E2E_SESSION_TOKEN = "e2e-test-session-token-fixed-for-testing";

export async function e2eCleanup() {
  // Delete Qdrant vectors first (no cascade from Postgres)
  await deleteMemoriesForUser(E2E_USER_ID).catch(() => {});

  await db.execute(sql`DELETE FROM job_runs WHERE user_id = ${E2E_USER_ID}`);
  await db.execute(sql`DELETE FROM briefings WHERE user_id = ${E2E_USER_ID}`);
  await db.execute(sql`DELETE FROM memory_facts WHERE user_id = ${E2E_USER_ID}`);
  await db.execute(sql`DELETE FROM memory_profiles WHERE user_id = ${E2E_USER_ID}`);
  await db.execute(sql`
    DELETE FROM messages WHERE conversation_id IN (
      SELECT id FROM conversations WHERE user_id = ${E2E_USER_ID}
    )
  `);
  await db.execute(sql`DELETE FROM conversations WHERE user_id = ${E2E_USER_ID}`);
  // Deleting the user cascades to the session table
  await db.execute(sql`DELETE FROM "user" WHERE id = ${E2E_USER_ID}`);
}

export async function e2eSeedUser() {
  await db
    .insert(schema.user)
    .values({
      id: E2E_USER_ID,
      email: "e2e@ally-test.com",
      name: "E2E Test User",
      tier: "premium",
    })
    .onConflictDoNothing();

  // Insert a real Better Auth session so auth middleware (getSession) can validate it.
  // The auth middleware uses Better Auth's session lookup, not raw JWT verification.
  await db
    .insert(schema.session)
    .values({
      id: "00000000-e2e0-0000-0000-session000001",
      token: E2E_SESSION_TOKEN,
      userId: E2E_USER_ID,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  return { sessionToken: E2E_SESSION_TOKEN };
}

export function buildE2EProfile(overrides?: Partial<MemoryProfile>): MemoryProfile {
  return {
    userId: E2E_USER_ID,
    version: 2,
    personalInfo: {
      preferredName: "Alex",
      fullName: "Alex Rivera",
      age: null,
      birthday: null,
      location: "San Francisco",
      livingSituation: "Lives alone in a studio apartment",
      other: {},
    },
    relationships: [
      { name: "Maya", relation: "best friend", notes: "Works at the same company, always supportive", lastMentioned: null },
      { name: "Jordan", relation: "partner", notes: "Long-distance, met in college", lastMentioned: null },
    ],
    work: {
      role: "Software Engineer",
      company: "TechCorp",
      companyType: "startup",
      currentProjects: ["Project Atlas"],
      currentGoals: ["Get promoted to senior"],
      stressors: ["Tight deadlines", "On-call rotations"],
      colleagues: ["Sam (engineering manager)"],
    },
    health: {
      fitnessGoals: ["Run a half marathon"],
      currentRoutine: "Morning runs 3x/week",
      sleepNotes: "Struggling with sleep lately",
      dietNotes: null,
      mentalHealthNotes: null,
      other: {},
    },
    interests: [
      { topic: "rock climbing", detail: "Started bouldering last month", firstMentioned: new Date().toISOString() },
      { topic: "cooking", detail: "Trying to cook more at home", firstMentioned: new Date().toISOString() },
    ],
    goals: [
      {
        description: "Get promoted to senior engineer",
        category: "career",
        status: "active" as const,
        progressNotes: "Good performance review last quarter",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        description: "Run a half marathon by June",
        category: "health",
        status: "active" as const,
        progressNotes: "Can do 8 miles comfortably",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    emotionalPatterns: {
      primaryStressors: ["Work deadlines", "Long-distance relationship"],
      copingMechanisms: ["Running", "Talking to Maya"],
      moodTrends: [],
      recurringThemes: ["imposter syndrome"],
      sensitivities: ["Comparisons to peers"],
    },
    pendingFollowups: [
      {
        topic: "Presentation to leadership",
        context: "Alex was anxious about a big presentation on Monday",
        detectedAt: new Date().toISOString().split("T")[0],
        resolved: false,
        priority: "high",
      },
    ],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
