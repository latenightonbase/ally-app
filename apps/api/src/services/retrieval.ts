import { db, schema } from "../db";
import { sql, eq, and, desc } from "drizzle-orm";
import { generateEmbedding } from "./embedding";
import type { MemoryCategory } from "@ally/shared";

interface RetrievedFact {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  score: number;
  createdAt: Date;
}

interface RetrievalOptions {
  userId: string;
  query: string;
  limit?: number;
  categoryFilter?: MemoryCategory;
  recencyWeight?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  importanceWeight?: number;
}

const DEFAULT_WEIGHTS = {
  semantic: 0.4,
  keyword: 0.2,
  recency: 0.25,
  importance: 0.15,
};

/**
 * Hybrid retrieval: combines semantic similarity, full-text search,
 * recency decay, and importance scoring in a single Postgres query.
 */
export async function retrieveRelevantFacts(
  options: RetrievalOptions,
): Promise<RetrievedFact[]> {
  const {
    userId,
    query,
    limit = 10,
    categoryFilter,
    semanticWeight = DEFAULT_WEIGHTS.semantic,
    keywordWeight = DEFAULT_WEIGHTS.keyword,
    recencyWeight = DEFAULT_WEIGHTS.recency,
    importanceWeight = DEFAULT_WEIGHTS.importance,
  } = options;

  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const keywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .join(" & ");

  const categoryCondition = categoryFilter
    ? sql`AND ${schema.memoryFacts.category} = ${categoryFilter}`
    : sql``;

  const results = await db.execute<{
    id: string;
    content: string;
    category: MemoryCategory;
    importance: number;
    hybrid_score: number;
    created_at: Date;
  }>(sql`
    SELECT
      id,
      content,
      category,
      importance,
      created_at,
      (
        (1 - (embedding <=> ${embeddingStr}::vector)) * ${semanticWeight}
        + COALESCE(
            ts_rank(
              to_tsvector('english', content),
              to_tsquery('english', ${keywords || "''"}),
              32
            ),
            0
          ) * ${keywordWeight}
        + EXP(-0.05 * EXTRACT(DAYS FROM NOW() - created_at)) * ${recencyWeight}
        + importance * ${importanceWeight}
      ) AS hybrid_score
    FROM ${schema.memoryFacts}
    WHERE user_id = ${userId}
      AND embedding IS NOT NULL
      ${categoryCondition}
    ORDER BY hybrid_score DESC
    LIMIT ${limit}
  `);

  return results.map((r) => ({
    id: r.id,
    content: r.content,
    category: r.category,
    importance: r.importance,
    score: r.hybrid_score,
    createdAt: r.created_at,
  }));
}

/**
 * Load the hot memory profile (always included in every AI call).
 */
export async function loadMemoryProfile(userId: string) {
  const result = await db.query.memoryProfiles.findFirst({
    where: eq(schema.memoryProfiles.userId, userId),
  });
  return result?.profile ?? null;
}

/**
 * Load recent conversation history for continuity (warm memory).
 */
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

/**
 * Update fact access time for relevance tracking.
 */
export async function touchFacts(factIds: string[]) {
  if (factIds.length === 0) return;
  await db
    .update(schema.memoryFacts)
    .set({ lastAccessedAt: new Date() })
    .where(
      sql`${schema.memoryFacts.id} IN (${sql.join(
        factIds.map((id) => sql`${id}`),
        sql`,`,
      )})`,
    );
}
