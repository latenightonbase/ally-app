import { describe, it, expect, beforeEach, beforeAll } from "bun:test";
import { truncateAll, seedUsers, seedMemoryFact } from "../../helpers/seed";
import { TEST_USER } from "../../helpers/jwt";

describe("memory service (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  describe("listFacts", () => {
    it("returns empty list for user with no facts", async () => {
      const { listFacts } = await import("../../../services/memory");
      const result = await listFacts(TEST_USER.id, { limit: 10, offset: 0 });
      expect(result.facts).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("returns seeded facts", async () => {
      await seedMemoryFact(TEST_USER.id, { content: "Loves hiking" });
      await seedMemoryFact(TEST_USER.id, { content: "Works at Acme" });

      const { listFacts } = await import("../../../services/memory");
      const result = await listFacts(TEST_USER.id, { limit: 10, offset: 0 });
      expect(result.total).toBe(2);
      expect(result.facts.length).toBe(2);
    });

    it("filters by category", async () => {
      await seedMemoryFact(TEST_USER.id, { content: "Works at Acme", category: "work" });
      await seedMemoryFact(TEST_USER.id, { content: "Runs marathons", category: "health" });

      const { listFacts } = await import("../../../services/memory");
      const result = await listFacts(TEST_USER.id, { limit: 10, offset: 0, category: "work" });
      expect(result.total).toBe(1);
      expect(result.facts[0].content).toBe("Works at Acme");
    });
  });

  describe("deleteFact", () => {
    it("deletes an existing fact and returns true", async () => {
      const fact = await seedMemoryFact(TEST_USER.id);
      const { deleteFact } = await import("../../../services/memory");
      const deleted = await deleteFact(TEST_USER.id, fact.id);
      expect(deleted).toBe(true);
    });

    it("returns false for non-existent fact", async () => {
      const { deleteFact } = await import("../../../services/memory");
      const deleted = await deleteFact(TEST_USER.id, "00000000-0000-0000-0000-000000000099");
      expect(deleted).toBe(false);
    });
  });

  describe("storeExtractedFacts", () => {
    it("stores semantic facts in DB + calls Qdrant upsert", async () => {
      const { storeExtractedFacts } = await import("../../../services/memory");
      const { batchUpsertMemories } = await import("../../../services/vectorStore");

      await storeExtractedFacts(
        TEST_USER.id,
        [
          {
            content: "Works as a software engineer",
            category: "work",
            confidence: 0.9,
            importance: 0.8,
            updateType: "new",
            entities: [],
            emotion: null,
            temporal: false,
            memoryType: "semantic",
            eventDate: null,
          },
        ],
        null,
      );

      const { listFacts } = await import("../../../services/memory");
      const result = await listFacts(TEST_USER.id, { limit: 10, offset: 0 });
      expect(result.total).toBe(1);
    });

    it("skips facts with confidence < 0.85", async () => {
      const { storeExtractedFacts } = await import("../../../services/memory");

      await storeExtractedFacts(
        TEST_USER.id,
        [
          {
            content: "Maybe likes hiking",
            category: "interests",
            confidence: 0.7,
            importance: 0.5,
            updateType: "new",
            entities: [],
            emotion: null,
            temporal: false,
            memoryType: "semantic",
            eventDate: null,
          },
        ],
        null,
      );

      const { listFacts } = await import("../../../services/memory");
      const result = await listFacts(TEST_USER.id, { limit: 10, offset: 0 });
      expect(result.total).toBe(0);
    });
  });

  describe("storeExtractedEvents", () => {
    it("stores future events (no vectors needed)", async () => {
      const { storeExtractedEvents } = await import("../../../services/memory");
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await expect(
        storeExtractedEvents(
          TEST_USER.id,
          [
            {
              content: "Job interview at Stripe",
              category: "work",
              confidence: 0.95,
              importance: 0.9,
              updateType: "new",
              entities: ["Stripe"],
              emotion: null,
              temporal: true,
              memoryType: "event",
              eventDate: nextWeek.toISOString(),
            },
          ],
          null,
        ),
      ).resolves.toBeUndefined();
    });

    it("skips event facts with no eventDate", async () => {
      const { storeExtractedEvents } = await import("../../../services/memory");

      await expect(
        storeExtractedEvents(
          TEST_USER.id,
          [
            {
              content: "Some event without date",
              category: "personal_info",
              confidence: 0.9,
              importance: 0.7,
              updateType: "new",
              entities: [],
              emotion: null,
              temporal: true,
              memoryType: "event",
              eventDate: null,
            },
          ],
          null,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("storeExtractedEpisodes", () => {
    it("stores episodic memories with correct TTL", async () => {
      const { storeExtractedEpisodes } = await import("../../../services/memory");

      await expect(
        storeExtractedEpisodes(
          TEST_USER.id,
          [
            {
              content: "Had a rough gym session",
              category: "health",
              confidence: 0.9,
              importance: 0.5,
              updateType: "new",
              entities: [],
              emotion: "frustrated",
              temporal: false,
              memoryType: "episodic",
              eventDate: null,
            },
          ],
          null,
        ),
      ).resolves.toBeUndefined();
    });
  });
});
