import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, authedRequest, json } from "../../helpers/app";
import { signTestToken, TEST_USER } from "../../helpers/jwt";
import {
  truncateAll,
  seedUsers,
  seedMemoryProfile,
  seedMemoryFact,
} from "../../helpers/seed";

describe("Memory Routes", () => {
  let app: ReturnType<typeof createTestApp>;
  let token: string;

  beforeAll(async () => {
    app = createTestApp();
    token = await signTestToken({ sub: TEST_USER.id, tier: TEST_USER.tier });
  });

  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  describe("GET /api/v1/memory/profile", () => {
    it("returns null when no profile exists", async () => {
      const res = await authedRequest(app, "/api/v1/memory/profile", token);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.profile).toBeNull();
    });

    it("returns profile when it exists", async () => {
      await seedMemoryProfile(TEST_USER.id);
      const res = await authedRequest(app, "/api/v1/memory/profile", token);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.profile).toBeDefined();
      expect(body.profile.personalInfo.preferredName).toBe("Test");
    });
  });

  describe("DELETE /api/v1/memory/profile", () => {
    it("deletes the profile and associated facts", async () => {
      await seedMemoryProfile(TEST_USER.id);
      await seedMemoryFact(TEST_USER.id);

      const res = await authedRequest(app, "/api/v1/memory/profile", token, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.deleted).toBe(true);

      const check = await authedRequest(app, "/api/v1/memory/profile", token);
      const checkBody = await json(check);
      expect(checkBody.profile).toBeNull();
    });
  });

  describe("GET /api/v1/memory/facts", () => {
    it("returns empty when no facts exist", async () => {
      const res = await authedRequest(app, "/api/v1/memory/facts", token);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.facts).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns facts with pagination metadata", async () => {
      await seedMemoryFact(TEST_USER.id, { content: "Fact 1", category: "work" });
      await seedMemoryFact(TEST_USER.id, { content: "Fact 2", category: "interests" });

      const res = await authedRequest(app, "/api/v1/memory/facts", token);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.facts.length).toBe(2);
      expect(body.total).toBe(2);
    });

    it("filters by category", async () => {
      await seedMemoryFact(TEST_USER.id, { content: "Work fact", category: "work" });
      await seedMemoryFact(TEST_USER.id, { content: "Health fact", category: "health" });

      const res = await authedRequest(app, "/api/v1/memory/facts?category=work", token);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.facts.length).toBe(1);
      expect(body.facts[0].category).toBe("work");
    });

    it("respects limit and offset", async () => {
      for (let i = 0; i < 5; i++) {
        await seedMemoryFact(TEST_USER.id, { content: `Fact ${i}` });
      }

      const res = await authedRequest(app, "/api/v1/memory/facts?limit=2&offset=2", token);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.facts.length).toBe(2);
      expect(body.total).toBe(5);
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(2);
    });
  });

  describe("DELETE /api/v1/memory/facts/:factId", () => {
    it("deletes a specific fact", async () => {
      const fact = await seedMemoryFact(TEST_USER.id);

      const res = await authedRequest(
        app,
        `/api/v1/memory/facts/${fact.id}`,
        token,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.deleted).toBe(true);
      expect(body.factId).toBe(fact.id);
    });

    it("returns deleted:false for non-existent fact", async () => {
      const res = await authedRequest(
        app,
        "/api/v1/memory/facts/00000000-0000-0000-0000-000000000099",
        token,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.deleted).toBe(false);
    });
  });
});
