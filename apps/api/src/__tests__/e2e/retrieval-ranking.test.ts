import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db, schema } from "../../db";
import { generateEmbedding, generateEmbeddings } from "../../services/embedding";
import { ensureCollection, batchUpsertMemories } from "../../services/vectorStore";
import { retrieveRelevantFacts } from "../../services/retrieval";
import { e2eCleanup, e2eSeedUser, E2E_USER_ID } from "./helpers";

const FACTS = [
  { content: "Alex's best friend Maya works at the same startup", category: "relationships" as const, importance: 0.8 },
  { content: "Alex is training for a half marathon and can run 8 miles", category: "health" as const, importance: 0.7 },
  { content: "Alex has a big presentation to leadership on Monday", category: "work" as const, importance: 0.9 },
  { content: "Alex struggles with imposter syndrome at work", category: "emotional_patterns" as const, importance: 0.8 },
  { content: "Alex enjoys rock climbing and started bouldering recently", category: "interests" as const, importance: 0.5 },
  { content: "Alex is in a long-distance relationship with Jordan", category: "relationships" as const, importance: 0.8 },
  { content: "Alex wants to get promoted to senior engineer this year", category: "goals" as const, importance: 0.9 },
  { content: "Alex copes with stress by going for runs", category: "emotional_patterns" as const, importance: 0.7 },
  { content: "Alex lives alone in a studio apartment in San Francisco", category: "personal_info" as const, importance: 0.5 },
  { content: "Alex is trying to cook more at home to save money", category: "interests" as const, importance: 0.4 },
  { content: "Alex had a good performance review last quarter", category: "work" as const, importance: 0.7 },
  { content: "Alex's engineering manager Sam is supportive but demanding", category: "work" as const, importance: 0.6 },
];

describe("Retrieval Ranking (live Voyage + Qdrant)", () => {
  beforeAll(async () => {
    await e2eCleanup();
    await e2eSeedUser();
    await ensureCollection();

    const embeddings = await generateEmbeddings(FACTS.map((f) => f.content));

    for (let i = 0; i < FACTS.length; i++) {
      const [inserted] = await db.insert(schema.memoryFacts).values({
        userId: E2E_USER_ID,
        content: FACTS[i].content,
        category: FACTS[i].category,
        importance: FACTS[i].importance,
        confidence: 0.9,
      }).returning({ id: schema.memoryFacts.id });

      await batchUpsertMemories([{
        factId: inserted.id,
        embedding: embeddings[i],
        payload: {
          factId: inserted.id,
          userId: E2E_USER_ID,
          type: "fact",
          category: FACTS[i].category,
          importance: FACTS[i].importance,
          emotion: null,
          createdAt: new Date().toISOString(),
          sourceType: "chat",
          content: FACTS[i].content,
        },
      }]);
    }
  });

  afterAll(async () => {
    await e2eCleanup();
  });

  it("returns work-related facts for a work query", async () => {
    const results = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "How is work going? Any stress at the office?",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);

    const topContents = results.slice(0, 3).map((r) => r.content);
    const hasWorkFact = topContents.some(
      (c) => c.includes("presentation") || c.includes("imposter") || c.includes("promoted") || c.includes("performance"),
    );
    expect(hasWorkFact).toBe(true);
  });

  it("returns relationship facts for a relationship query", async () => {
    const results = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "Tell me about Maya and the people in Alex's life",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);

    const topContents = results.slice(0, 3).map((r) => r.content);
    const hasRelFact = topContents.some(
      (c) => c.includes("Maya") || c.includes("Jordan"),
    );
    expect(hasRelFact).toBe(true);
  });

  it("returns health/fitness facts for a fitness query", async () => {
    const results = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "How is the running training going?",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);

    // Check top 5 (not just top 3) — recency/importance weights can shift ranking slightly
    const topContents = results.map((r) => r.content);
    const hasFitnessFact = topContents.some(
      (c) => c.includes("marathon") || c.includes("run") || c.includes("stress"),
    );
    expect(hasFitnessFact).toBe(true);
  });

  it("respects category filter", async () => {
    const results = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      // Use a semantically relevant query so dense search finds matches above the score threshold
      query: "work projects and career goals",
      limit: 10,
      categoryFilter: "work",
    });

    for (const r of results) {
      expect(r.category).toBe("work");
    }
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("respects limit parameter", async () => {
    const results = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "What do you know about Alex?",
      limit: 3,
    });

    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("scores are ordered descending", async () => {
    const results = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "work promotion and career goals",
      limit: 10,
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("importance-heavy weights surface high-importance facts", async () => {
    const results = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "What matters most to Alex right now?",
      limit: 5,
      importanceWeight: 0.6,
      semanticWeight: 0.2,
      recencyWeight: 0.2,
    });

    expect(results.length).toBeGreaterThan(0);
    const avgImportance =
      results.reduce((sum, r) => sum + r.importance, 0) / results.length;
    expect(avgImportance).toBeGreaterThanOrEqual(0.6);
  });

  it("semantic-heavy weights surface semantically relevant facts", async () => {
    const results = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "feeling anxious and not good enough at the job",
      limit: 3,
      semanticWeight: 0.8,
      recencyWeight: 0.1,
      importanceWeight: 0.1,
    });

    expect(results.length).toBeGreaterThan(0);
    const topContents = results.map((r) => r.content);
    const hasEmotional = topContents.some(
      (c) => c.includes("imposter") || c.includes("stress"),
    );
    expect(hasEmotional).toBe(true);
  });
});
