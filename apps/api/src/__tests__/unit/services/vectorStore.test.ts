/**
 * vectorStore unit tests.
 * The vectorStore module is mocked by setup.ts (so it doesn't need a real Qdrant cluster).
 * These tests verify:
 *   1. The mock interface is correctly shaped (mock setup is callable without errors)
 *   2. The scoring formula logic (via an inline implementation to bypass the module mock)
 *
 * Full Qdrant integration quality is validated in e2e/retrieval-ranking.test.ts.
 */
import { describe, it, expect } from "bun:test";

describe("vectorStore (mocked)", () => {
  describe("mock interface", () => {
    it("upsertMemory is callable from the mock", async () => {
      const { upsertMemory } = await import("../../../services/vectorStore");
      await expect(
        upsertMemory("fact-1", new Array(1024).fill(0), {
          factId: "fact-1",
          userId: "u1",
          type: "fact",
          category: "work",
          importance: 0.8,
          emotion: null,
          createdAt: new Date().toISOString(),
          sourceType: "chat",
          content: "test",
        }),
      ).resolves.toBeUndefined();
    });

    it("searchMemory returns [] from the mock", async () => {
      const { searchMemory } = await import("../../../services/vectorStore");
      const results = await searchMemory({ userId: "u1", queryEmbedding: new Array(1024).fill(0) });
      expect(Array.isArray(results)).toBe(true);
    });

    it("deleteMemory resolves without error", async () => {
      const { deleteMemory } = await import("../../../services/vectorStore");
      await expect(deleteMemory("fact-1")).resolves.toBeUndefined();
    });

    it("batchDeleteMemories resolves without error", async () => {
      const { batchDeleteMemories } = await import("../../../services/vectorStore");
      await expect(batchDeleteMemories([])).resolves.toBeUndefined();
      await expect(batchDeleteMemories(["a", "b"])).resolves.toBeUndefined();
    });

    it("batchUpsertMemories resolves without error", async () => {
      const { batchUpsertMemories } = await import("../../../services/vectorStore");
      await expect(batchUpsertMemories([])).resolves.toBeUndefined();
    });

    it("ensureCollection resolves without error", async () => {
      const { ensureCollection } = await import("../../../services/vectorStore");
      await expect(ensureCollection()).resolves.toBeUndefined();
    });

    it("searchMemoryByKeyword returns an array from the mock", async () => {
      const { searchMemoryByKeyword } = await import("../../../services/vectorStore");
      const results = await searchMemoryByKeyword("u1", "gym motivation");
      expect(Array.isArray(results)).toBe(true);
    });

    it("batchUpdateImportance resolves without error", async () => {
      const { batchUpdateImportance } = await import("../../../services/vectorStore");
      await expect(batchUpdateImportance([])).resolves.toBeUndefined();
      await expect(
        batchUpdateImportance([{ factId: "fact-1", importance: 0.6 }]),
      ).resolves.toBeUndefined();
    });
  });

  describe("scoreMemoryResults formula (inline logic test)", () => {
    // Replicate the scoring formula inline so we can test the logic
    // without being affected by the setup.ts mock of the entire module.
    const DECAY_RATE = 0.02;
    const EMOTION_BOOST = 0.08;

    function score(
      semanticScore: number,
      importance: number,
      createdAt: string,
      weights = { semantic: 0.5, recency: 0.3, importance: 0.2 },
      emotionHint?: string,
      emotion?: string,
    ): number {
      const ageInDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
      const recencyScore = Math.exp(-DECAY_RATE * ageInDays);
      const emotionBoost = emotionHint && emotion === emotionHint ? EMOTION_BOOST : 0;
      return (
        semanticScore * weights.semantic +
        recencyScore * weights.recency +
        importance * weights.importance +
        emotionBoost
      );
    }

    it("recent high-importance items score higher than old low-importance", () => {
      const recentHighImportance = score(0.9, 0.9, new Date().toISOString());
      const oldLowImportance = score(0.5, 0.2, new Date(Date.now() - 90 * 86_400_000).toISOString());
      expect(recentHighImportance).toBeGreaterThan(oldLowImportance);
    });

    it("with importance-heavy weights, high importance wins over high semantic", () => {
      const importanceHeavy = score(0.3, 1.0, new Date().toISOString(), { semantic: 0.1, recency: 0.1, importance: 0.8 });
      const semanticHeavy = score(0.95, 0.1, new Date(Date.now() - 30 * 86_400_000).toISOString(), { semantic: 0.1, recency: 0.1, importance: 0.8 });
      expect(importanceHeavy).toBeGreaterThan(semanticHeavy);
    });

    it("with semantic-heavy weights, high semantic score wins", () => {
      const highSemantic = score(0.95, 0.1, new Date(Date.now() - 30 * 86_400_000).toISOString(), { semantic: 0.8, recency: 0.1, importance: 0.1 });
      const lowSemantic = score(0.3, 1.0, new Date().toISOString(), { semantic: 0.8, recency: 0.1, importance: 0.1 });
      expect(highSemantic).toBeGreaterThan(lowSemantic);
    });

    it("recency exponential decay is between 0 and 1", () => {
      const recentDecay = Math.exp(-DECAY_RATE * 0);
      const oldDecay = Math.exp(-DECAY_RATE * 365);
      expect(recentDecay).toBe(1.0);
      expect(oldDecay).toBeGreaterThan(0);
      expect(oldDecay).toBeLessThan(1);
    });

    it("emotion boost adds 0.08 when emotion matches hint", () => {
      const withMatch = score(0.7, 0.5, new Date().toISOString(), undefined, "anxious", "anxious");
      const withoutMatch = score(0.7, 0.5, new Date().toISOString(), undefined, "anxious", "happy");
      const noHint = score(0.7, 0.5, new Date().toISOString(), undefined, undefined, "anxious");
      expect(withMatch - withoutMatch).toBeCloseTo(EMOTION_BOOST, 5);
      expect(noHint).toBe(withoutMatch);
    });

    it("emotion boost is 0 when no hint is provided", () => {
      const baseScore = score(0.7, 0.5, new Date().toISOString());
      const noHintScore = score(0.7, 0.5, new Date().toISOString(), undefined, undefined, "sad");
      expect(baseScore).toBe(noHintScore);
    });
  });
});
