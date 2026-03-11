import { db, schema } from "../db";
import { sql, eq, and, desc } from "drizzle-orm";
import { generateEmbedding, generateEmbeddings, addContextualPrefix } from "./embedding";
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

const RECENCY_DECAY = 0.02;

function expandQuery(query: string): string[] {
  const queries = [query];

  const expansions: [RegExp, string][] = [
    [/\b(how('s| is|'re| are) my)\b/i, query.replace(/how('s| is|'re| are) my/i, "")],
    [/\b(what('s| is) (my|the))\b/i, query.replace(/what('s| is) (my|the)/i, "")],
    [/\b(tell me about)\b/i, query.replace(/tell me about/i, "")],
    [/\b(remember when|do you remember)\b/i, query.replace(/remember when|do you remember/i, "")],
  ];

  for (const [pattern, expanded] of expansions) {
    if (pattern.test(query) && expanded.trim().length > 3) {
      queries.push(expanded.trim());
    }
  }

  return queries.slice(0, 3);
}

async function hybridSearch(
  userId: string,
  queryEmbedding: number[],
  keywords: string,
  limit: number,
  weights: typeof DEFAULT_WEIGHTS,
  categoryFilter?: MemoryCategory,
): Promise<RetrievedFact[]> {
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

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
        (1 - (embedding <=> ${embeddingStr}::vector)) * ${weights.semantic}
        + COALESCE(
            ts_rank(
              to_tsvector('english', content),
              to_tsquery('english', ${keywords || "''"}),
              32
            ),
            0
          ) * ${weights.keyword}
        + EXP(-${RECENCY_DECAY} * EXTRACT(DAYS FROM NOW() - created_at)) * ${weights.recency}
        + importance * ${weights.importance}
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
 * Hybrid retrieval with query expansion and result merging.
 * Fetches broader candidate set, then deduplicates and ranks.
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

  const weights = { semantic: semanticWeight, keyword: keywordWeight, recency: recencyWeight, importance: importanceWeight };
  const queries = expandQuery(query);

  const contextualQuery = addContextualPrefix(query);
  const allEmbeddings = await generateEmbeddings(
    queries.map((q, i) => (i === 0 ? contextualQuery : addContextualPrefix(q))),
    "query",
  );

  const candidateMap = new Map<string, RetrievedFact>();
  const fetchLimit = Math.min(limit * 2, 20);

  const searchPromises = allEmbeddings.map((embedding, i) => {
    const keywords = queries[i]
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .join(" & ");

    return hybridSearch(userId, embedding, keywords, fetchLimit, weights, categoryFilter);
  });

  const allResults = await Promise.all(searchPromises);

  for (const results of allResults) {
    for (const fact of results) {
      const existing = candidateMap.get(fact.id);
      if (!existing || fact.score > existing.score) {
        candidateMap.set(fact.id, fact);
      }
    }
  }

  return Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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

/**
 * Update fact access time and bump importance slightly for accessed facts.
 * This creates a positive feedback loop — frequently relevant facts
 * stay important.
 */
export async function touchFacts(factIds: string[]) {
  if (factIds.length === 0) return;
  await db.execute(sql`
    UPDATE ${schema.memoryFacts}
    SET
      last_accessed_at = NOW(),
      importance = LEAST(importance + 0.02, 1.0)
    WHERE id IN (${sql.join(factIds.map((id) => sql`${id}`), sql`,`)})
  `);
}
