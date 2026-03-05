import { db, schema } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { generateEmbedding, generateEmbeddings } from "./embedding";
import type {
  MemoryProfile,
  ExtractedFact,
  PendingFollowup,
  MemoryCategory,
} from "@ally/shared";

export async function getOrCreateProfile(
  userId: string,
): Promise<MemoryProfile> {
  const existing = await db.query.memoryProfiles.findFirst({
    where: eq(schema.memoryProfiles.userId, userId),
  });

  if (existing) return existing.profile;

  const defaultProfile: MemoryProfile = {
    userId,
    version: 2,
    personalInfo: {
      preferredName: null,
      fullName: null,
      age: null,
      birthday: null,
      location: null,
      livingSituation: null,
      other: {},
    },
    relationships: [],
    work: {
      role: null,
      company: null,
      companyType: null,
      currentProjects: [],
      currentGoals: [],
      stressors: [],
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
    interests: [],
    goals: [],
    emotionalPatterns: {
      primaryStressors: [],
      copingMechanisms: [],
      moodTrends: [],
      recurringThemes: [],
      sensitivities: [],
    },
    pendingFollowups: [],
    updatedAt: new Date().toISOString(),
  };

  await db.insert(schema.memoryProfiles).values({
    userId,
    profile: defaultProfile,
  });

  return defaultProfile;
}

export async function updateProfile(
  userId: string,
  updates: Partial<MemoryProfile>,
): Promise<void> {
  const current = await getOrCreateProfile(userId);
  const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };

  await db
    .update(schema.memoryProfiles)
    .set({ profile: merged, updatedAt: new Date() })
    .where(eq(schema.memoryProfiles.userId, userId));
}

export async function storeExtractedFacts(
  userId: string,
  facts: ExtractedFact[],
  sourceConversationId: string | null,
): Promise<void> {
  if (facts.length === 0) return;

  const validFacts = facts.filter((f) => f.confidence >= 0.7);
  if (validFacts.length === 0) return;

  const embeddings = await generateEmbeddings(
    validFacts.map((f) => f.content),
  );

  const rows = validFacts.map((fact, i) => ({
    userId,
    content: fact.content,
    category: fact.category,
    importance: fact.importance,
    confidence: fact.confidence,
    temporal: fact.temporal,
    entities: fact.entities,
    emotion: fact.emotion,
    embedding: embeddings[i],
    sourceConversationId,
    sourceDate: new Date(),
  }));

  await db.insert(schema.memoryFacts).values(rows);
}

export async function addFollowups(
  userId: string,
  followups: { topic: string; context: string; priority: "high" | "medium" | "low" }[],
): Promise<void> {
  if (followups.length === 0) return;

  const profile = await getOrCreateProfile(userId);
  const newFollowups: PendingFollowup[] = followups.map((f) => ({
    topic: f.topic,
    context: f.context,
    detectedAt: new Date().toISOString().split("T")[0],
    resolved: false,
    priority: f.priority,
  }));

  await updateProfile(userId, {
    pendingFollowups: [...profile.pendingFollowups, ...newFollowups],
  });
}

export async function deleteProfile(userId: string): Promise<void> {
  await db
    .delete(schema.memoryProfiles)
    .where(eq(schema.memoryProfiles.userId, userId));
  await db
    .delete(schema.memoryFacts)
    .where(eq(schema.memoryFacts.userId, userId));
}

export async function deleteFact(
  userId: string,
  factId: string,
): Promise<boolean> {
  const result = await db
    .delete(schema.memoryFacts)
    .where(
      and(
        eq(schema.memoryFacts.id, factId),
        eq(schema.memoryFacts.userId, userId),
      ),
    )
    .returning({ id: schema.memoryFacts.id });

  return result.length > 0;
}

export async function listFacts(
  userId: string,
  options: { category?: MemoryCategory; limit: number; offset: number },
) {
  const conditions = [eq(schema.memoryFacts.userId, userId)];
  if (options.category) {
    conditions.push(eq(schema.memoryFacts.category, options.category));
  }

  const [facts, countResult] = await Promise.all([
    db.query.memoryFacts.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.memoryFacts.createdAt)],
      limit: options.limit,
      offset: options.offset,
      columns: {
        id: true,
        content: true,
        category: true,
        confidence: true,
        sourceDate: true,
        createdAt: true,
      },
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.memoryFacts)
      .where(and(...conditions)),
  ]);

  return { facts, total: Number(countResult[0].count) };
}
