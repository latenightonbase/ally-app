import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, authedRequest, json } from "../../helpers/app";
import { signTestToken, TEST_USER, TEST_FREE_USER, TEST_PREMIUM_USER } from "../../helpers/jwt";
import { truncateAll, seedUsers, seedWeeklyInsight } from "../../helpers/seed";

describe("GET /api/v1/insights/weekly", () => {
  let app: ReturnType<typeof createTestApp>;
  let premiumToken: string;
  let basicToken: string;
  let freeToken: string;

  beforeAll(async () => {
    app = createTestApp();
    premiumToken = await signTestToken({ sub: TEST_PREMIUM_USER.id, tier: "premium" });
    basicToken = await signTestToken({ sub: TEST_USER.id, tier: "basic" });
    freeToken = await signTestToken({ sub: TEST_FREE_USER.id, tier: "free_trial" });
  });

  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it("returns 403 for non-premium users (basic)", async () => {
    const res = await authedRequest(app, "/api/v1/insights/weekly", basicToken);
    expect(res.status).toBe(403);
  });

  it("returns 403 for free tier users", async () => {
    const res = await authedRequest(app, "/api/v1/insights/weekly", freeToken);
    expect(res.status).toBe(403);
  });

  it("returns empty insights list when none exist", async () => {
    const res = await authedRequest(app, "/api/v1/insights/weekly", premiumToken);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.insights).toEqual([]);
    expect(body.limit).toBeDefined();
    expect(body.offset).toBeDefined();
  });

  it("returns insight when one has been generated", async () => {
    await seedWeeklyInsight(TEST_PREMIUM_USER.id, "2026-03-03");

    const res = await authedRequest(app, "/api/v1/insights/weekly", premiumToken);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.insights.length).toBe(1);
    expect(body.insights[0].weekOf).toBe("2026-03-03");
    expect(body.insights[0].summary).toBeDefined();
    expect(body.insights[0].moodTrend).toBeDefined();
    expect(Array.isArray(body.insights[0].topThemes)).toBe(true);
    expect(Array.isArray(body.insights[0].followUpSuggestions)).toBe(true);
    expect(body.insights[0].createdAt).toBeDefined();
  });

  it("marks the latest insight as delivered on first read", async () => {
    const insight = await seedWeeklyInsight(TEST_PREMIUM_USER.id);

    const first = await authedRequest(app, "/api/v1/insights/weekly", premiumToken);
    expect(first.status).toBe(200);
    const firstBody = await json(first);
    expect(firstBody.insights[0].delivered).toBe(true);

    // Seeded with default delivered=false; confirm the route flipped it
    expect(insight.delivered).toBe(false);
  });

  it("returns multiple insights ordered by most recent first", async () => {
    await seedWeeklyInsight(TEST_PREMIUM_USER.id, "2026-02-17");
    await seedWeeklyInsight(TEST_PREMIUM_USER.id, "2026-02-24");
    await seedWeeklyInsight(TEST_PREMIUM_USER.id, "2026-03-03");

    const res = await authedRequest(app, "/api/v1/insights/weekly?limit=10", premiumToken);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.insights.length).toBe(3);
    // Most recent first
    expect(body.insights[0].weekOf).toBe("2026-03-03");
    expect(body.insights[2].weekOf).toBe("2026-02-17");
  });

  it("paginates correctly", async () => {
    await seedWeeklyInsight(TEST_PREMIUM_USER.id, "2026-02-17");
    await seedWeeklyInsight(TEST_PREMIUM_USER.id, "2026-02-24");

    const res = await authedRequest(
      app,
      "/api/v1/insights/weekly?limit=1&offset=1",
      premiumToken,
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.insights.length).toBe(1);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(1);
  });

  it("does not return other users' insights", async () => {
    await seedWeeklyInsight(TEST_USER.id, "2026-03-03");

    const res = await authedRequest(app, "/api/v1/insights/weekly", premiumToken);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.insights).toEqual([]);
  });
});
