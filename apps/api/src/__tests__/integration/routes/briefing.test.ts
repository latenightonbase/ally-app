import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, authedRequest, json } from "../../helpers/app";
import { signTestToken, TEST_USER, TEST_FREE_USER } from "../../helpers/jwt";
import { truncateAll, seedUsers, seedBriefing } from "../../helpers/seed";

describe("Briefing Routes", () => {
  let app: ReturnType<typeof createTestApp>;
  let proToken: string;
  let freeToken: string;

  beforeAll(async () => {
    app = createTestApp();
    proToken = await signTestToken({ sub: TEST_USER.id, tier: "pro" });
    freeToken = await signTestToken({ sub: TEST_FREE_USER.id, tier: "free_trial" });
  });

  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  describe("GET /api/v1/briefing", () => {
    it("returns briefing for today", async () => {
      await seedBriefing(TEST_USER.id);
      const res = await authedRequest(app, "/api/v1/briefing", proToken);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.briefing).toBeDefined();
      expect(body.briefing.content).toBeDefined();
      expect(body.briefing.delivered).toBe(true);
    });

    it("returns null when no briefing exists", async () => {
      const res = await authedRequest(app, "/api/v1/briefing", proToken);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.briefing).toBeNull();
    });

    it("returns 403 for free tier users", async () => {
      const res = await authedRequest(app, "/api/v1/briefing", freeToken);
      expect(res.status).toBe(403);
    });

    it("accepts a date query parameter", async () => {
      await seedBriefing(TEST_USER.id, "2026-01-15");
      const res = await authedRequest(app, "/api/v1/briefing?date=2026-01-15", proToken);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.briefing).toBeDefined();
      expect(body.briefing.date).toBe("2026-01-15");
    });
  });

  describe("GET /api/v1/briefing/history", () => {
    it("returns empty array when no briefings exist", async () => {
      const res = await authedRequest(app, "/api/v1/briefing/history", proToken);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.briefings).toEqual([]);
    });

    it("returns briefings with pagination", async () => {
      await seedBriefing(TEST_USER.id, "2026-01-01");
      await seedBriefing(TEST_USER.id, "2026-01-02");
      await seedBriefing(TEST_USER.id, "2026-01-03");

      const res = await authedRequest(app, "/api/v1/briefing/history?limit=2", proToken);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.briefings.length).toBe(2);
      expect(body.limit).toBe(2);
    });

    it("returns 403 for free tier users", async () => {
      const res = await authedRequest(app, "/api/v1/briefing/history", freeToken);
      expect(res.status).toBe(403);
    });
  });
});
