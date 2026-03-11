import { db, schema } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { generateEmbeddings, addContextualPrefix } from "./embedding";
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

/**
 * Deep-merge two objects: for each key in `source`, if both values are
 * plain objects, recurse; if both are arrays, concatenate; otherwise
 * the source value wins.
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sv = source[key];
    const tv = target[key];
    if (sv === undefined || sv === null) continue;
    if (Array.isArray(tv) && Array.isArray(sv)) {
      (result as any)[key] = [...tv, ...sv];
    } else if (
      typeof tv === "object" &&
      tv !== null &&
      !Array.isArray(tv) &&
      typeof sv === "object" &&
      sv !== null &&
      !Array.isArray(sv)
    ) {
      (result as any)[key] = deepMerge(tv, sv as any);
    } else {
      (result as any)[key] = sv;
    }
  }
  return result;
}

export async function updateProfile(
  userId: string,
  updates: Partial<MemoryProfile>,
): Promise<void> {
  const current = await getOrCreateProfile(userId);
  const merged = deepMerge(current, { ...updates, updatedAt: new Date().toISOString() });

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
  if (facts.length === 0) {
    console.log(`[storeExtractedFacts] No facts provided, skipping`);
    return;
  }

  const validFacts = facts.filter((f) => f.confidence >= 0.7);
  if (validFacts.length === 0) {
    console.log(
      `[storeExtractedFacts] All ${facts.length} facts filtered out by confidence threshold (need >= 0.7). ` +
      `Confidences: ${facts.map((f) => f.confidence).join(", ")}`,
    );
    return;
  }

  const textsToEmbed = validFacts.map((f) => addContextualPrefix(f.content, f.category));
  const embeddings = await generateEmbeddings(textsToEmbed, "document");

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
  console.log(`[storeExtractedFacts] Inserted ${rows.length} facts into DB for user ${userId}`);
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

export async function updateFact(
  userId: string,
  factId: string,
  content: string,
): Promise<boolean> {
  const existing = await db.query.memoryFacts.findFirst({
    where: and(
      eq(schema.memoryFacts.id, factId),
      eq(schema.memoryFacts.userId, userId),
    ),
    columns: { id: true, category: true },
  });

  if (!existing) return false;

  const embeddingText = addContextualPrefix(content, existing.category);
  const [embedding] = await generateEmbeddings([embeddingText], "document");

  const result = await db
    .update(schema.memoryFacts)
    .set({ content, embedding, sourceDate: new Date() })
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
