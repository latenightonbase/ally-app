import { db, schema } from "../db";
import { sql, eq, and, desc, inArray, isNull } from "drizzle-orm";
import { generateEmbedding, addContextualPrefix } from "./embedding";
import { searchMemory, searchMemoryByKeyword, scoreMemoryResults, updatePayload } from "./vectorStore";
import type { VectorSearchResult } from "./vectorStore";
import { getEntityLinkedIds, extractEntityNamesFromText } from "./graphStore";
import { callClaude } from "../ai/client";
import type { MemoryCategory } from "@ally/shared";

export interface RetrievedFact {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  score: number;
  type: "fact" | "episode";
  createdAt: Date;
}

export interface RetrievalOptions {
  userId: string;
  query: string;
  limit?: number;
  categoryFilter?: MemoryCategory;
  emotionHint?: string;
  semanticWeight?: number;
  recencyWeight?: number;
  importanceWeight?: number;
  /**
   * @deprecated Use semanticWeight + recencyWeight + importanceWeight instead.
   * Accepted for backward compatibility with existing callers and e2e tests.
   */
  keywordWeight?: number;
}

export async function loadMemoryProfile(userId: string) {
  const result = await db.query.memoryProfiles.findFirst({
    where: eq(schema.memoryProfiles.userId, userId),
  });
  return result?.profile ?? null;
}

export async function loadRecentHistory(
  conversationId: string,
  limit = 20,
) {
  return db.query.messages.findMany({
    where: eq(schema.messages.conversationId, conversationId),
    orderBy: [desc(schema.messages.createdAt)],
    limit,
  });
}

const VALID_EMOTIONS = new Set(["sad", "anxious", "stressed", "happy", "frustrated", "lonely"]);

const EMOTION_CLASSIFIER_PROMPT =
  "You are an emotion classifier. " +
  "Reply with exactly one word from this list: sad, anxious, stressed, happy, frustrated, lonely. " +
  "If no clear emotion is present, reply: none. " +
  "No explanation, punctuation, or other output.";

/**
 * LLM-based emotion classifier (Claude Haiku, maxTokens=5).
 * Detects the dominant emotion from a user message to enable emotion-aware
 * retrieval scoring. Handles indirect cues that keyword matching misses
 * (e.g. "nobody texted me back" → lonely, "my chest feels tight" → anxious).
 *
 * Always returns undefined on failure — never blocks retrieval.
 */
export async function detectEmotionFromQuery(query: string): Promise<string | undefined> {
  try {
    const { text } = await callClaude({
      system: EMOTION_CLASSIFIER_PROMPT,
      messages: [{ role: "user", content: query }],
      maxTokens: 5,
      modelTier: "fast",
    });
    const label = text.trim().toLowerCase();
    return VALID_EMOTIONS.has(label) ? label : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reciprocal Rank Fusion (k=60) over two result sets.
 * Gives each result a score = Σ 1/(k + rank), then sorts descending.
 * Results appearing in both sets receive a combined score boost.
 */
export function mergeWithRRF(
  denseResults: VectorSearchResult[],
  keywordResults: VectorSearchResult[],
  limit: number,
  k = 60,
): VectorSearchResult[] {
  const rrfScores = new Map<string, number>();
  const payloadIndex = new Map<string, VectorSearchResult>();

  const accumulateRank = (results: VectorSearchResult[]) => {
    results.forEach((r, i) => {
      rrfScores.set(r.factId, (rrfScores.get(r.factId) ?? 0) + 1 / (k + i + 1));
      if (!payloadIndex.has(r.factId)) payloadIndex.set(r.factId, r);
    });
  };

  accumulateRank(denseResults);
  accumulateRank(keywordResults);

  return [...rrfScores.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([factId, score]) => ({ ...payloadIndex.get(factId)!, score }));
}

/**
 * Three-stage hybrid retrieval:
 *   Stage 1A — Dense vector search: Qdrant cosine similarity on query embedding
 *   Stage 1B — Keyword search: Qdrant text index on content field (BM25-like)
 *              Stages 1A + 1B merged via Reciprocal Rank Fusion (RRF)
 *   Stage 2  — Entity graph: FalkorDB 2-hop lookup for named entities in query
 * Results are merged, enriched from Postgres, and reranked with emotion boost.
 */
export async function retrieveRelevantFacts(
  options: RetrievalOptions,
): Promise<RetrievedFact[]> {
  const {
    userId,
    query,
    limit = 10,
    categoryFilter,
    emotionHint,
    semanticWeight = 0.5,
    recencyWeight = 0.3,
    importanceWeight = 0.2,
  } = options;

  const contextualQuery = addContextualPrefix(query);
  const stageLimit = Math.min(limit * 2, 20);

  // Run emotion detection, query embedding, and entity graph lookup in parallel.
  // Emotion detection (Haiku) and embedding (Voyage) are fully independent.
  const [detectedEmotion, queryEmbedding, entityIds] = await Promise.all([
    emotionHint ? Promise.resolve(emotionHint) : detectEmotionFromQuery(query),
    generateEmbedding(contextualQuery),
    getEntityLinkedIds(userId, extractEntityNamesFromText(query)).catch(() => ({
      factIds: [],
      episodeIds: [],
    })),
  ]);

  // Stage 1A: Dense vector search
  const denseResults = await searchMemory({
    userId,
    queryEmbedding,
    limit: stageLimit,
    categoryFilter,
  }).catch((err) => {
    console.error("[retrieval] Qdrant dense search failed:", err.message);
    return [];
  });

  // Stage 1B: Keyword text search (parallel after embedding is ready)
  const keywordResults = await searchMemoryByKeyword(userId, query, stageLimit).catch(() => []);

  // Merge Stage 1A + 1B via RRF
  const vectorResults = mergeWithRRF(denseResults, keywordResults, stageLimit);

  const allVectorFactIds = new Set(
    vectorResults.filter((r) => r.type === "fact").map((r) => r.factId),
  );
  const allVectorEpisodeIds = new Set(
    vectorResults.filter((r) => r.type === "episode").map((r) => r.factId),
  );

  const entityOnlyFactIds = entityIds.factIds.filter((id) => !allVectorFactIds.has(id));
  const entityOnlyEpisodeIds = entityIds.episodeIds.filter((id) => !allVectorEpisodeIds.has(id));

  // Fetch content from Postgres for all candidates
  const [facts, episodes, entityFacts, entityEpisodes] = await Promise.all([
    allVectorFactIds.size > 0
      ? db.query.memoryFacts.findMany({
          where: and(
            inArray(schema.memoryFacts.id, [...allVectorFactIds]),
            isNull(schema.memoryFacts.supersededBy),
          ),
          columns: { id: true, content: true, category: true, importance: true, createdAt: true },
        })
      : Promise.resolve([]),

    allVectorEpisodeIds.size > 0
      ? db.query.memoryEpisodes.findMany({
          where: inArray(schema.memoryEpisodes.id, [...allVectorEpisodeIds]),
          columns: { id: true, content: true, category: true, importance: true, createdAt: true },
        })
      : Promise.resolve([]),

    entityOnlyFactIds.length > 0
      ? db.query.memoryFacts.findMany({
          where: and(
            inArray(schema.memoryFacts.id, entityOnlyFactIds),
            isNull(schema.memoryFacts.supersededBy),
          ),
          columns: { id: true, content: true, category: true, importance: true, createdAt: true },
        })
      : Promise.resolve([]),

    entityOnlyEpisodeIds.length > 0
      ? db.query.memoryEpisodes.findMany({
          where: inArray(schema.memoryEpisodes.id, entityOnlyEpisodeIds),
          columns: { id: true, content: true, category: true, importance: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Build score lookup from Qdrant results
  const vectorScoreMap = new Map(vectorResults.map((r) => [r.factId, r.score]));

  // Rerank vector results with recency + importance + optional emotion boost
  const rerankedVector = scoreMemoryResults(
    vectorResults,
    { semantic: semanticWeight, recency: recencyWeight, importance: importanceWeight },
    detectedEmotion,
  );

  // Build the merged candidate list
  const candidateMap = new Map<string, RetrievedFact>();

  const addToMap = (
    rows: { id: string; content: string; category: MemoryCategory; importance: number; createdAt: Date }[],
    type: "fact" | "episode",
    baseScore: number,
  ) => {
    for (const row of rows) {
      if (!candidateMap.has(row.id)) {
        const vectorScore = vectorScoreMap.get(row.id) ?? baseScore;
        candidateMap.set(row.id, {
          id: row.id,
          content: row.content,
          category: row.category,
          importance: row.importance,
          score: vectorScore,
          type,
          createdAt: row.createdAt,
        });
      }
    }
  };

  addToMap(facts, "fact", 0);
  addToMap(episodes, "episode", 0);
  addToMap(entityFacts, "fact", 0.4);
  addToMap(entityEpisodes, "episode", 0.4);

  // Apply reranked scores to vector-found items
  for (const r of rerankedVector) {
    const existing = candidateMap.get(r.factId);
    if (existing) {
      existing.score = r.finalScore;
    }
  }

  const results = Array.from(candidateMap.values())
    .filter((r) => r.score >= 0.35) // Drop low-relevance matches to save prompt tokens
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Bump importance for accessed facts (positive feedback loop)
  const accessedIds = results.map((r) => r.id);
  touchFacts(accessedIds).catch(() => {});

  return results;
}

/**
 * Bump importance for frequently retrieved facts.
 * Fire-and-forget — errors don't affect the response.
 */
async function touchFacts(factIds: string[]): Promise<void> {
  if (factIds.length === 0) return;

  await db.execute(sql`
    UPDATE ${schema.memoryFacts}
    SET
      last_accessed_at = NOW(),
      importance = LEAST(importance + 0.02, 1.0)
    WHERE id = ANY(${factIds})
      AND superseded_by IS NULL
  `);

  await Promise.all(
    factIds.map((id) =>
      updatePayload(id, {}).catch(() => {}),
    ),
  );
}
