import { QdrantClient } from "@qdrant/js-client-rest";
import type { MemoryCategory, MemorySourceType } from "@ally/shared";

const COLLECTION = "ally_memories";
const VECTOR_SIZE = 1024;

export interface VectorMemoryPayload {
  factId: string;
  userId: string;
  type: "fact" | "episode";
  category: MemoryCategory;
  importance: number;
  emotion: string | null;
  createdAt: string;
  sourceType: MemorySourceType;
  content: string;
}

export interface VectorSearchResult {
  factId: string;
  type: "fact" | "episode";
  score: number;
  payload: VectorMemoryPayload;
}

let _client: QdrantClient | null = null;

function getClient(): QdrantClient {
  if (!_client) {
    const url = process.env.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;
    if (!url) throw new Error("QDRANT_URL env var is required");
    _client = new QdrantClient({ url, apiKey });
  }
  return _client;
}

/**
 * Idempotent collection bootstrap. Called once on server start.
 * Creates the ally_memories collection with a dense vector config
 * and payload indexes for efficient filtering.
 */
export async function ensureCollection(): Promise<void> {
  const client = getClient();

  const exists = await client
    .collectionExists(COLLECTION)
    .catch(() => ({ exists: false }));

  if (!exists.exists) {
    await client.createCollection(COLLECTION, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
    });

    await Promise.all([
      client.createPayloadIndex(COLLECTION, {
        field_name: "userId",
        field_schema: "keyword",
      }),
      client.createPayloadIndex(COLLECTION, {
        field_name: "type",
        field_schema: "keyword",
      }),
      client.createPayloadIndex(COLLECTION, {
        field_name: "category",
        field_schema: "keyword",
      }),
      client.createPayloadIndex(COLLECTION, {
        field_name: "importance",
        field_schema: "float",
      }),
      client.createPayloadIndex(COLLECTION, {
        field_name: "createdAt",
        field_schema: "datetime",
      }),
      client.createPayloadIndex(COLLECTION, {
        field_name: "emotion",
        field_schema: "keyword",
      }),
      client.createPayloadIndex(COLLECTION, {
        field_name: "content",
        field_schema: { type: "text", tokenizer: "word" },
      }),
    ]);

    console.log(`[vectorStore] Created collection '${COLLECTION}'`);
  }
}

export async function upsertMemory(
  factId: string,
  embedding: number[],
  payload: VectorMemoryPayload,
): Promise<void> {
  const client = getClient();
  await client.upsert(COLLECTION, {
    wait: true,
    points: [{ id: factId, vector: embedding, payload: payload as unknown as Record<string, unknown> }],
  });
}

export async function batchUpsertMemories(
  items: { factId: string; embedding: number[]; payload: VectorMemoryPayload }[],
): Promise<void> {
  if (items.length === 0) return;
  const client = getClient();
  await client.upsert(COLLECTION, {
    wait: true,
    points: items.map((item) => ({
      id: item.factId,
      vector: item.embedding,
      payload: item.payload as unknown as Record<string, unknown>,
    })),
  });
}

export async function deleteMemory(factId: string): Promise<void> {
  const client = getClient();
  await client.delete(COLLECTION, {
    wait: true,
    points: [factId],
  });
}

export async function batchDeleteMemories(factIds: string[]): Promise<void> {
  if (factIds.length === 0) return;
  const client = getClient();
  await client.delete(COLLECTION, {
    wait: true,
    points: factIds,
  });
}

export async function deleteMemoriesForUser(userId: string): Promise<void> {
  const client = getClient();
  await client.delete(COLLECTION, {
    wait: true,
    filter: {
      must: [{ key: "userId", match: { value: userId } }],
    },
  });
}

export interface SearchMemoryOptions {
  userId: string;
  queryEmbedding: number[];
  limit?: number;
  categoryFilter?: MemoryCategory;
  typeFilter?: "fact" | "episode";
  importanceThreshold?: number;
  emotionFilter?: string;
  textQuery?: string;
}

/**
 * Hybrid search: dense vector similarity with payload-based filtering.
 * Results are returned scored by Qdrant cosine similarity; callers
 * apply recency + importance reranking client-side via scoreMemoryResults().
 */
export async function searchMemory(
  options: SearchMemoryOptions,
): Promise<VectorSearchResult[]> {
  const {
    userId,
    queryEmbedding,
    limit = 20,
    categoryFilter,
    typeFilter,
    importanceThreshold,
    emotionFilter,
    textQuery,
  } = options;

  const mustConditions: object[] = [
    { key: "userId", match: { value: userId } },
  ];

  if (categoryFilter) mustConditions.push({ key: "category", match: { value: categoryFilter } });
  if (typeFilter) mustConditions.push({ key: "type", match: { value: typeFilter } });
  if (importanceThreshold !== undefined) {
    mustConditions.push({ key: "importance", range: { gte: importanceThreshold } });
  }
  if (emotionFilter) mustConditions.push({ key: "emotion", match: { value: emotionFilter } });
  if (textQuery) {
    mustConditions.push({ key: "content", match: { text: textQuery } });
  }

  const results = await getClient().search(COLLECTION, {
    vector: queryEmbedding,
    filter: { must: mustConditions },
    with_payload: true,
    limit,
    score_threshold: 0.2,
  });

  return results.map((r) => ({
    factId: r.id as string,
    type: (r.payload as unknown as VectorMemoryPayload).type,
    score: r.score,
    payload: r.payload as unknown as VectorMemoryPayload,
  }));
}

/**
 * Keyword-only retrieval using Qdrant's content text index.
 * Used as Stage 1B in hybrid retrieval (merged with dense via RRF).
 * Returns results with a placeholder score of 0.6 — RRF handles actual ranking.
 */
export async function searchMemoryByKeyword(
  userId: string,
  textQuery: string,
  limit = 20,
): Promise<VectorSearchResult[]> {
  const results = await getClient().scroll(COLLECTION, {
    filter: {
      must: [
        { key: "userId", match: { value: userId } },
        { key: "content", match: { text: textQuery } },
      ],
    },
    with_payload: true,
    with_vector: false,
    limit,
  });

  return (results.points ?? []).map((r) => ({
    factId: r.id as string,
    type: (r.payload as unknown as VectorMemoryPayload).type,
    score: 0.6,
    payload: r.payload as unknown as VectorMemoryPayload,
  }));
}

/**
 * Rerank results by combining Qdrant cosine similarity with
 * recency, importance, and an optional emotion boost signal.
 */
export function scoreMemoryResults(
  results: VectorSearchResult[],
  weights = { semantic: 0.5, recency: 0.3, importance: 0.2 },
  emotionHint?: string,
): (VectorSearchResult & { finalScore: number })[] {
  const DECAY_RATE = 0.02;
  const EMOTION_BOOST = 0.08;
  const now = Date.now();

  return results
    .map((r) => {
      const ageInDays = (now - new Date(r.payload.createdAt).getTime()) / 86_400_000;
      const recencyScore = Math.exp(-DECAY_RATE * ageInDays);
      const emotionBoost = emotionHint && r.payload.emotion === emotionHint ? EMOTION_BOOST : 0;
      const finalScore =
        r.score * weights.semantic +
        recencyScore * weights.recency +
        r.payload.importance * weights.importance +
        emotionBoost;
      return { ...r, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Batch-update the importance payload in Qdrant for multiple points.
 * Used by the monthly decay job to keep Qdrant payload in sync with Postgres.
 */
export async function batchUpdateImportance(
  updates: { factId: string; importance: number }[],
): Promise<void> {
  if (updates.length === 0) return;
  const client = getClient();
  await Promise.all(
    updates.map(({ factId, importance }) =>
      client.setPayload(COLLECTION, {
        payload: { importance } as Record<string, unknown>,
        points: [factId],
      }),
    ),
  );
}

export async function updatePayload(
  factId: string,
  updates: Partial<Pick<VectorMemoryPayload, "importance" | "emotion">>,
): Promise<void> {
  const client = getClient();
  await client.setPayload(COLLECTION, {
    payload: updates as Record<string, unknown>,
    points: [factId],
  });
}
