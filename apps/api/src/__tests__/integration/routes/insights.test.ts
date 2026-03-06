import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, authedRequest, json } from "../../helpers/app";
import { signTestToken, TEST_USER, TEST_FREE_USER, TEST_PREMIUM_USER } from "../../helpers/jwt";
import { truncateAll, seedUsers } from "../../helpers/seed";
import { db, schema } from "../../../db";

describe("GET /api/v1/insights/weekly", () => {
  let app: ReturnType<typeof createTestApp>;
  let premiumToken: string;
  let proToken: string;
  let freeToken: string;

  beforeAll(async () => {
    app = createTestApp();
    premiumToken = await signTestToken({ sub: TEST_PREMIUM_USER.id, tier: "premium" });
    proToken = await signTestToken({ sub: TEST_USER.id, tier: "pro" });
    freeToken = await signTestToken({ sub: TEST_FREE_USER.id, tier: "free_trial" });
  });

  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it("returns 403 for non-premium users (pro)", async () => {
    const res = await authedRequest(app, "/api/v1/insights/weekly", proToken);
    expect(res.status).toBe(403);
  });

  it("returns 403 for free tier users", async () => {
    const res = await authedRequest(app, "/api/v1/insights/weekly", freeToken);
    expect(res.status).toBe(403);
  });

  it("returns null insight when none exists", async () => {
    const res = await authedRequest(app, "/api/v1/insights/weekly", premiumToken);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.insight).toBeNull();
    expect(body.message).toBeDefined();
  });

  it("returns insight when a completed job run exists", async () => {
    await db.insert(schema.jobRuns).values({
      jobName: "weekly_insights",
      userId: TEST_PREMIUM_USER.id,
      status: "completed",
      completedAt: new Date(),
      metadata: {
        insight: {
          weekOf: "2026-02-24",
          summary: "Great week",
          moodTrend: "improving",
          topThemes: ["work"],
          followUpSuggestions: ["Check on project"],
        },
      },
    });

    const res = await authedRequest(app, "/api/v1/insights/weekly", premiumToken);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.insight).toBeDefined();
    expect(body.insight.weekOf).toBe("2026-02-24");
    expect(body.insight.summary).toBe("Great week");
  });
});
