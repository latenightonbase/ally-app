import { db, schema } from "../db";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { generateEmbedding, generateEmbeddings, addContextualPrefix } from "./embedding";
import { upsertMemory, batchUpsertMemories, deleteMemory, updatePayload } from "./vectorStore";
import { upsertEntity, createEdge, resolveEntityIdByName } from "./graphStore";
import type {
  MemoryProfile,
  DynamicAttribute,
  ExtractedFact,
  ExtractedEntity,
  PendingFollowup,
  MemoryCategory,
  MemorySourceType,
} from "@ally/shared";

export async function getOrCreateProfile(
  userId: string,
): Promise<MemoryProfile> {
  const existing = await db.query.memoryProfiles.findFirst({
    where: eq(schema.memoryProfiles.userId, userId),
  });

  if (existing) {
    // Merge with defaults so older/partial profiles never crash on missing fields
    const p = existing.profile;
    const defaultPersonalInfo = { preferredName: null, fullName: null, age: null, birthday: null, location: null, livingSituation: null, other: {} };
    const defaultWork = { role: null, company: null, companyType: null, currentProjects: [], currentGoals: [], stressors: [], colleagues: [] };
    const defaultHealth = { fitnessGoals: [], currentRoutine: null, sleepNotes: null, dietNotes: null, mentalHealthNotes: null, other: {} };
    const defaultEmotional = { primaryStressors: [], copingMechanisms: [], moodTrends: [], recurringThemes: [], sensitivities: [] };
    return {
      ...p,
      userId: p.userId ?? userId,
      version: p.version ?? 2,
      personalInfo: { ...defaultPersonalInfo, ...p.personalInfo },
      relationships: p.relationships ?? [],
      work: { ...defaultWork, ...p.work },
      health: { ...defaultHealth, ...p.health },
      interests: p.interests ?? [],
      goals: p.goals ?? [],
      emotionalPatterns: { ...defaultEmotional, ...p.emotionalPatterns },
      pendingFollowups: p.pendingFollowups ?? [],
    };
  }

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
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sv = source[key];
    const tv = target[key];
    if (sv === undefined || sv === null) continue;
    if (Array.isArray(tv) && Array.isArray(sv)) {
      (result as Record<string, unknown>)[key as string] = [...tv, ...sv];
    } else if (
      typeof tv === "object" &&
      tv !== null &&
      !Array.isArray(tv) &&
      typeof sv === "object" &&
      sv !== null &&
      !Array.isArray(sv)
    ) {
      (result as Record<string, unknown>)[key as string] = deepMerge(
        tv as Record<string, unknown>,
        sv as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key as string] = sv;
    }
  }
  return result;
}

export async function updateProfile(
  userId: string,
  updates: Partial<MemoryProfile>,
): Promise<void> {
  const current = await getOrCreateProfile(userId);
  const merged = deepMerge(
    current as unknown as Record<string, unknown>,
    { ...updates, updatedAt: new Date().toISOString() } as Record<string, unknown>,
  ) as unknown as MemoryProfile;

  await db
    .update(schema.memoryProfiles)
    .set({ profile: merged, updatedAt: new Date() })
    .where(eq(schema.memoryProfiles.userId, userId));
}

function computeEpisodicTTL(importance: number): Date {
  const now = new Date();
  let daysToAdd: number;
  if (importance < 0.5) daysToAdd = 7;
  else if (importance < 0.7) daysToAdd = 14;
  else daysToAdd = 30;
  now.setDate(now.getDate() + daysToAdd);
  return now;
}

/**
 * Store durable semantic facts (memoryType: "semantic").
 * Persists to Postgres + Qdrant. Handles contradiction resolution
 * by marking superseded facts inactive.
 */
export async function storeExtractedFacts(
  userId: string,
  facts: ExtractedFact[],
  sourceConversationId: string | null,
): Promise<void> {
  if (facts.length === 0) return;

  const validFacts = facts.filter(
    (f) => f.confidence >= 0.85 && (f.memoryType === "semantic" || !f.memoryType),
  );
  if (validFacts.length === 0) return;

  const textsToEmbed = validFacts.map((f) => addContextualPrefix(f.content, f.category));
  const embeddings = await generateEmbeddings(textsToEmbed, "document");

  const rows = validFacts.map((fact, i) => ({
    userId,
    content: fact.content,
    category: fact.category,
    importance: fact.importance,
    confidence: fact.confidence,
    temporal: false,
    entities: fact.entities,
    emotion: fact.emotion,
    sourceConversationId,
    sourceDate: new Date(),
    sourceType: "chat" as const,
  }));

  const insertedFacts = await db
    .insert(schema.memoryFacts)
    .values(rows)
    .returning({ id: schema.memoryFacts.id, content: schema.memoryFacts.content });

  const qdrantUpserts = insertedFacts.map((inserted, i) => ({
    factId: inserted.id,
    embedding: embeddings[i],
    payload: {
      factId: inserted.id,
      userId,
      type: "fact" as const,
      category: validFacts[i].category,
      importance: validFacts[i].importance,
      emotion: validFacts[i].emotion,
      createdAt: new Date().toISOString(),
      sourceType: "chat" as const,
      content: validFacts[i].content,
    },
  }));

  await batchUpsertMemories(qdrantUpserts);

  // Contradiction resolution: mark superseded facts
  for (const fact of validFacts) {
    if (fact.supersedes) {
      await markSupersededFact(userId, fact.supersedes, insertedFacts.find(
        (_, i) => validFacts[i] === fact,
      )?.id ?? null);
    }
  }

  console.log(`[memory] Stored ${insertedFacts.length} semantic facts for user ${userId}`);
}

async function markSupersededFact(
  userId: string,
  supersededContent: string,
  newFactId: string | null,
): Promise<void> {
  if (!newFactId) return;

  const existing = await db.query.memoryFacts.findFirst({
    where: and(
      eq(schema.memoryFacts.userId, userId),
      eq(schema.memoryFacts.content, supersededContent),
      isNull(schema.memoryFacts.supersededBy),
    ),
    columns: { id: true },
  });

  if (!existing) return;

  await db
    .update(schema.memoryFacts)
    .set({ supersededBy: newFactId })
    .where(eq(schema.memoryFacts.id, existing.id));

  await deleteMemory(existing.id).catch(() => {});
}

/**
 * Store short-lived episodic facts (memoryType: "episodic").
 * TTL is computed from importance. Persists to Postgres + Qdrant.
 */
export async function storeExtractedEpisodes(
  userId: string,
  facts: ExtractedFact[],
  sourceConversationId: string | null,
): Promise<void> {
  if (facts.length === 0) return;

  const validFacts = facts.filter((f) => f.confidence >= 0.85);
  if (validFacts.length === 0) return;

  const textsToEmbed = validFacts.map((f) => addContextualPrefix(f.content, f.category));
  const embeddings = await generateEmbeddings(textsToEmbed, "document");

  const rows = validFacts.map((fact) => ({
    userId,
    content: fact.content,
    category: fact.category,
    emotion: fact.emotion,
    entities: fact.entities,
    importance: fact.importance,
    confidence: fact.confidence,
    expiresAt: computeEpisodicTTL(fact.importance),
    sourceConversationId,
    sourceType: "chat" as const,
    sourceDate: new Date(),
  }));

  const insertedEpisodes = await db
    .insert(schema.memoryEpisodes)
    .values(rows)
    .returning({ id: schema.memoryEpisodes.id });

  const qdrantUpserts = insertedEpisodes.map((inserted, i) => ({
    factId: inserted.id,
    embedding: embeddings[i],
    payload: {
      factId: inserted.id,
      userId,
      type: "episode" as const,
      category: validFacts[i].category,
      importance: validFacts[i].importance,
      emotion: validFacts[i].emotion,
      createdAt: new Date().toISOString(),
      sourceType: "chat" as const,
      content: validFacts[i].content,
    },
  }));

  await batchUpsertMemories(qdrantUpserts);

  console.log(`[memory] Stored ${insertedEpisodes.length} episodic memories for user ${userId}`);
}

/**
 * Store future-dated temporal events (memoryType: "event").
 * No vectors — events are proactively injected by date, not searched.
 */
export async function storeExtractedEvents(
  userId: string,
  facts: ExtractedFact[],
  sourceConversationId: string | null,
): Promise<void> {
  if (facts.length === 0) return;

  const validFacts = facts.filter(
    (f) => f.confidence >= 0.85 && f.eventDate,
  );
  if (validFacts.length === 0) return;

  const rows = validFacts.map((fact) => ({
    userId,
    content: fact.content,
    eventDate: new Date(fact.eventDate!),
    context: null as string | null,
    sourceConversationId,
    sourceType: "chat" as const,
  }));

  await db.insert(schema.memoryEvents).values(rows);

  console.log(`[memory] Stored ${rows.length} future events for user ${userId}`);
}

/**
 * Store extracted entities in FalkorDB graph.
 * Entity names are normalized for coreference resolution.
 */
export async function storeEntities(
  userId: string,
  entities: ExtractedEntity[],
  linkedFactIds: string[],
): Promise<void> {
  if (entities.length === 0) return;

  const entityIdMap = new Map<string, string>();

  for (const entity of entities) {
    const factId = linkedFactIds[0];
    const entityId = await upsertEntity({
      userId,
      name: entity.name,
      type: entity.type,
      description: entity.description,
      aliases: entity.aliases,
      factId,
    }).catch((err) => {
      console.error(`[memory] Entity upsert failed for "${entity.name}": ${err.message}`);
      return null;
    });

    if (entityId) entityIdMap.set(entity.name.toLowerCase(), entityId);
  }

  for (const entity of entities) {
    const sourceId = entityIdMap.get(entity.name.toLowerCase());
    if (!sourceId) continue;

    for (const rel of entity.relatedTo ?? []) {
      // Prefer current-batch id; fall back to graph lookup for cross-batch targets
      const batchId = entityIdMap.get(rel.name.toLowerCase());
      const resolvedId = batchId ?? (await resolveEntityIdByName(userId, rel.name).catch(() => null));
      if (!resolvedId) continue;
      const targetId = resolvedId;

      await createEdge({
        userId,
        sourceEntityId: sourceId,
        targetEntityId: targetId,
        relationType: rel.relation,
      }).catch((err) =>
        console.error(`[memory] Edge creation failed: ${err.message}`),
      );

      // Create the reverse edge for symmetric relationships (best_friend, partner, sibling, etc.)
      const symmetric = /best_friend|partner|sibling|spouse|married|colleague|co_?worker|roommate/i.test(rel.relation);
      if (symmetric) {
        await createEdge({
          userId,
          sourceEntityId: targetId,
          targetEntityId: sourceId,
          relationType: rel.relation,
        }).catch(() => {});
      }
    }
  }
}

/**
 * Merge newly extracted dynamic attributes into the user's hot profile.
 * Adds learnedAt timestamp and skips attributes with confidence below threshold.
 * Lower-confidence new observations won't overwrite higher-confidence existing ones.
 */
export async function mergeDynamicAttributes(
  userId: string,
  attributes: Record<string, { value: string; confidence: number }>,
  sourceConversationId?: string,
): Promise<void> {
  if (Object.keys(attributes).length === 0) return;

  const now = new Date().toISOString();
  const profile = await getOrCreateProfile(userId);
  const existing = profile.dynamicAttributes ?? {};

  const merged: Record<string, DynamicAttribute> = { ...existing };
  for (const [key, attr] of Object.entries(attributes)) {
    const existingAttr = existing[key];
    if (existingAttr && existingAttr.confidence >= attr.confidence) {
      continue;
    }
    merged[key] = {
      value: attr.value,
      confidence: attr.confidence,
      learnedAt: now,
      sourceConversationId,
    };
  }

  await updateProfile(userId, { dynamicAttributes: merged });
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

/**
 * Resolve follow-ups that are addressed by newly extracted facts.
 * Uses keyword overlap between the fact content/entities and follow-up
 * topic/context to detect when a follow-up has been addressed.
 *
 * Also auto-expires follow-ups older than `maxAgeDays`.
 */
export async function resolveFollowups(
  userId: string,
  newFacts: ExtractedFact[],
  maxAgeDays = 14,
): Promise<number> {
  const profile = await getOrCreateProfile(userId);
  const followups = profile.pendingFollowups;
  if (followups.length === 0) return 0;

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  let resolvedCount = 0;

  // Gather all keywords from new facts for matching
  const factKeywords = new Set<string>();
  for (const fact of newFacts) {
    // Split fact content into lowercase words
    for (const word of fact.content.toLowerCase().split(/\s+/)) {
      if (word.length > 3) factKeywords.add(word);
    }
    // Include entity names
    for (const entity of fact.entities) {
      factKeywords.add(entity.toLowerCase());
    }
  }

  const updatedFollowups = followups.map((f) => {
    if (f.resolved) return f;

    // Auto-expire old follow-ups
    const detectedDate = new Date(f.detectedAt);
    if (detectedDate < cutoff) {
      resolvedCount++;
      return { ...f, resolved: true };
    }

    // Check if any new facts address this follow-up
    const topicWords = f.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const contextWords = f.context.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const followupWords = [...topicWords, ...contextWords];

    // If ≥2 keywords overlap between the follow-up and new facts, consider it resolved
    const overlapCount = followupWords.filter((w) => factKeywords.has(w)).length;
    if (overlapCount >= 2) {
      resolvedCount++;
      return { ...f, resolved: true };
    }

    return f;
  });

  if (resolvedCount > 0) {
    await db
      .update(schema.memoryProfiles)
      .set({
        profile: { ...profile, pendingFollowups: updatedFollowups, updatedAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(schema.memoryProfiles.userId, userId));
    console.log(`[memory] Resolved ${resolvedCount} follow-up(s) for user ${userId}`);
  }

  return resolvedCount;
}

/**
 * Expire all follow-ups older than maxAgeDays for a given user.
 * Called by the maintenance job to prevent stale follow-ups from
 * polluting daily pings indefinitely.
 */
export async function expireOldFollowups(
  userId: string,
  maxAgeDays = 14,
): Promise<number> {
  const profile = await getOrCreateProfile(userId);
  const followups = profile.pendingFollowups;
  if (followups.length === 0) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  let expiredCount = 0;
  const updatedFollowups = followups.map((f) => {
    if (f.resolved) return f;
    if (new Date(f.detectedAt) < cutoff) {
      expiredCount++;
      return { ...f, resolved: true };
    }
    return f;
  });

  if (expiredCount > 0) {
    await db
      .update(schema.memoryProfiles)
      .set({
        profile: { ...profile, pendingFollowups: updatedFollowups, updatedAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(schema.memoryProfiles.userId, userId));
    console.log(`[memory] Expired ${expiredCount} stale follow-up(s) for user ${userId}`);
  }

  return expiredCount;
}

export async function deleteProfile(userId: string): Promise<void> {
  await db
    .delete(schema.memoryProfiles)
    .where(eq(schema.memoryProfiles.userId, userId));
  await db
    .delete(schema.memoryFacts)
    .where(eq(schema.memoryFacts.userId, userId));
  await db
    .delete(schema.memoryEpisodes)
    .where(eq(schema.memoryEpisodes.userId, userId));
  await db
    .delete(schema.memoryEvents)
    .where(eq(schema.memoryEvents.userId, userId));
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

  if (result.length > 0) {
    await deleteMemory(factId).catch(() => {});
    return true;
  }
  return false;
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
    columns: { id: true, category: true, importance: true, emotion: true },
  });

  if (!existing) return false;

  const embeddingText = addContextualPrefix(content, existing.category);
  const [embedding] = await generateEmbeddings([embeddingText], "document");

  const result = await db
    .update(schema.memoryFacts)
    .set({ content, sourceDate: new Date() })
    .where(
      and(
        eq(schema.memoryFacts.id, factId),
        eq(schema.memoryFacts.userId, userId),
      ),
    )
    .returning({ id: schema.memoryFacts.id });

  if (result.length > 0) {
    await upsertMemory(factId, embedding, {
      factId,
      userId,
      type: "fact",
      category: existing.category,
      importance: existing.importance,
      emotion: existing.emotion,
      createdAt: new Date().toISOString(),
      sourceType: "chat",
      content,
    });
  }

  return result.length > 0;
}

export async function listFacts(
  userId: string,
  options: { category?: MemoryCategory; limit: number; offset: number; includeSuperseeded?: boolean },
) {
  const conditions = [eq(schema.memoryFacts.userId, userId)];
  if (!options.includeSuperseeded) {
    conditions.push(isNull(schema.memoryFacts.supersededBy));
  }
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
        sourceType: true,
        supersededBy: true,
      },
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.memoryFacts)
      .where(and(...conditions)),
  ]);

  return { facts, total: Number(countResult[0].count) };
}

/**
 * Restore a superseded fact: clear its supersededBy pointer and re-index in Qdrant.
 * Returns false if the fact doesn't exist, belongs to a different user, or is not superseded.
 */
export async function restoreFact(userId: string, factId: string): Promise<boolean> {
  const fact = await db.query.memoryFacts.findFirst({
    where: and(
      eq(schema.memoryFacts.id, factId),
      eq(schema.memoryFacts.userId, userId),
    ),
    columns: {
      id: true,
      content: true,
      category: true,
      importance: true,
      sourceType: true,
      emotion: true,
      supersededBy: true,
    },
  });

  if (!fact || !fact.supersededBy) return false;

  await db
    .update(schema.memoryFacts)
    .set({ supersededBy: null })
    .where(eq(schema.memoryFacts.id, factId));

  // Re-index in Qdrant so the restored fact participates in retrieval
  const embedding = await generateEmbedding(addContextualPrefix(fact.content, fact.category));
  await upsertMemory(factId, embedding, {
    factId,
    userId,
    type: "fact",
    category: fact.category,
    importance: fact.importance,
    emotion: fact.emotion ?? null,
    createdAt: new Date().toISOString(),
    sourceType: (fact.sourceType ?? "chat") as MemorySourceType,
    content: fact.content,
  });

  return true;
}
