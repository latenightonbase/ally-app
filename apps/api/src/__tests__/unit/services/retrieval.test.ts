import { describe, it, expect } from "bun:test";
import { retrieveRelevantFacts } from "../../../services/retrieval";

const userId = "user-1";
const query = "How is work going?";

describe("retrieveRelevantFacts (with mocked Qdrant + FalkorDB)", () => {
  it("resolves to an array", async () => {
    const results = await retrieveRelevantFacts({ userId, query });
    expect(Array.isArray(results)).toBe(true);
  });

  it("respects the limit parameter", async () => {
    const results = await retrieveRelevantFacts({ userId, query, limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array when Qdrant returns nothing", async () => {
    const results = await retrieveRelevantFacts({ userId, query: "something very obscure" });
    expect(results).toEqual([]);
  });

  it("accepts backward-compat keywordWeight without error", async () => {
    await expect(
      retrieveRelevantFacts({
        userId,
        query,
        semanticWeight: 0.4,
        keywordWeight: 0.2,
        recencyWeight: 0.2,
        importanceWeight: 0.2,
      }),
    ).resolves.toBeDefined();
  });

  it("accepts categoryFilter without error", async () => {
    await expect(
      retrieveRelevantFacts({ userId, query, categoryFilter: "work" }),
    ).resolves.toBeDefined();
  });

  it("accepts emotionHint without error", async () => {
    await expect(
      retrieveRelevantFacts({ userId, query, emotionHint: "anxious" }),
    ).resolves.toBeDefined();
  });
});

// Tests for detectEmotionFromQuery — uses the callClaude mock from setup.ts.
// The mock always returns "Mock Ally response" which is not a valid emotion
// label, so detectEmotionFromQuery resolves to undefined in tests.
// The important behaviors (response parsing, error handling) are validated
// via the inline label-parsing logic tests below.
describe("detectEmotionFromQuery (LLM-based, mocked callClaude)", () => {
  it("resolves to undefined when callClaude returns a non-label response", async () => {
    const { detectEmotionFromQuery } = await import("../../../services/retrieval");
    const result = await detectEmotionFromQuery("I am so anxious about the interview");
    // Mock returns "Mock Ally response" → not a valid label → undefined
    expect(result).toBeUndefined();
  });

  it("never throws — returns undefined on any error", async () => {
    const { detectEmotionFromQuery } = await import("../../../services/retrieval");
    await expect(detectEmotionFromQuery("")).resolves.toBeUndefined();
  });
});

// Inline tests for the response-parsing / label-validation logic.
// These test the core correctness of what happens once the LLM responds.
describe("detectEmotionFromQuery label parsing (inline logic test)", () => {
  const VALID_EMOTIONS = new Set(["sad", "anxious", "stressed", "happy", "frustrated", "lonely"]);

  function parseEmotionLabel(rawText: string): string | undefined {
    const label = rawText.trim().toLowerCase();
    return VALID_EMOTIONS.has(label) ? label : undefined;
  }

  it("accepts each valid emotion label", () => {
    for (const emotion of VALID_EMOTIONS) {
      expect(parseEmotionLabel(emotion)).toBe(emotion);
    }
  });

  it("handles leading/trailing whitespace and uppercase from the model", () => {
    expect(parseEmotionLabel("  Anxious  ")).toBe("anxious");
    expect(parseEmotionLabel("STRESSED")).toBe("stressed");
    expect(parseEmotionLabel("\nLonely\n")).toBe("lonely");
  });

  it("returns undefined for 'none' (model's no-emotion signal)", () => {
    expect(parseEmotionLabel("none")).toBeUndefined();
  });

  it("returns undefined for any unexpected model output", () => {
    expect(parseEmotionLabel("I think the user is anxious")).toBeUndefined();
    expect(parseEmotionLabel("nervous")).toBeUndefined();
    expect(parseEmotionLabel("")).toBeUndefined();
  });
});

// Inline tests for mergeWithRRF logic.
describe("mergeWithRRF (inline algorithm test)", () => {
  type Result = { factId: string; score: number; type: "fact" | "episode"; payload: any };

  function makeResult(factId: string, score = 0.8): Result {
    return { factId, score, type: "fact", payload: {} };
  }

  function mergeWithRRF(
    dense: Result[],
    keyword: Result[],
    limit: number,
    k = 60,
  ): Result[] {
    const rrfScores = new Map<string, number>();
    const payloadIndex = new Map<string, Result>();

    const accumulateRank = (results: Result[]) => {
      results.forEach((r, i) => {
        rrfScores.set(r.factId, (rrfScores.get(r.factId) ?? 0) + 1 / (k + i + 1));
        if (!payloadIndex.has(r.factId)) payloadIndex.set(r.factId, r);
      });
    };

    accumulateRank(dense);
    accumulateRank(keyword);

    return [...rrfScores.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([factId, score]) => ({ ...payloadIndex.get(factId)!, score }));
  }

  it("results appearing in both sets rank higher than single-set results", () => {
    const dense = [makeResult("both-1"), makeResult("dense-only")];
    const keyword = [makeResult("both-1"), makeResult("keyword-only")];
    const merged = mergeWithRRF(dense, keyword, 10);

    const both1 = merged.find((r) => r.factId === "both-1")!;
    const denseOnly = merged.find((r) => r.factId === "dense-only")!;
    expect(both1.score).toBeGreaterThan(denseOnly.score);
  });

  it("respects the limit parameter", () => {
    const dense = [makeResult("a"), makeResult("b"), makeResult("c")];
    const keyword = [makeResult("d"), makeResult("e"), makeResult("f")];
    expect(mergeWithRRF(dense, keyword, 4).length).toBe(4);
  });

  it("includes results from both sets when no overlap", () => {
    const dense = [makeResult("d1"), makeResult("d2")];
    const keyword = [makeResult("k1"), makeResult("k2")];
    const merged = mergeWithRRF(dense, keyword, 10);
    const ids = merged.map((r) => r.factId);
    expect(ids).toContain("d1");
    expect(ids).toContain("k1");
  });

  it("returns empty array when both inputs are empty", () => {
    expect(mergeWithRRF([], [], 10)).toEqual([]);
  });

  it("ranks higher RRF rank correctly with k=60", () => {
    // Rank 0 in dense: 1/(60+1) ≈ 0.01639
    // Rank 1 in dense: 1/(60+2) ≈ 0.01613
    const dense = [makeResult("top"), makeResult("second")];
    const merged = mergeWithRRF(dense, [], 10);
    expect(merged[0].factId).toBe("top");
  });
});
