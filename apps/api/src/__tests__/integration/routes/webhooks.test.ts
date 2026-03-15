import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, request, json } from "../../helpers/app";
import { TEST_USER } from "../../helpers/jwt";
import { truncateAll, seedUsers } from "../../helpers/seed";
import { db, schema } from "../../../db";
import { eq } from "drizzle-orm";

describe("POST /api/v1/webhooks/subscription", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  const webhookBody = {
    userId: TEST_USER.id,
    event: "subscription_updated",
    tier: "premium",
    effectiveAt: "2026-03-04T00:00:00Z",
  };

  it("updates user tier with valid webhook secret", async () => {
    const res = await request(app, "/api/v1/webhooks/subscription", {
      method: "POST",
      headers: { "x-webhook-secret": process.env.WEBHOOK_SECRET ?? "test-webhook-secret" },
      body: webhookBody,
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.acknowledged).toBe(true);

    const updatedUser = await db.query.user.findFirst({
      where: eq(schema.user.id, TEST_USER.id),
    });
    expect(updatedUser?.tier).toBe("premium");
  });

  it("returns 401 with invalid webhook secret", async () => {
    const res = await request(app, "/api/v1/webhooks/subscription", {
      method: "POST",
      headers: { "x-webhook-secret": "wrong-secret" },
      body: webhookBody,
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 without webhook secret header", async () => {
    const res = await request(app, "/api/v1/webhooks/subscription", {
      method: "POST",
      body: webhookBody,
    });
    expect(res.status).toBe(401);
  });

  it("returns 422 with missing body fields", async () => {
    const res = await request(app, "/api/v1/webhooks/subscription", {
      method: "POST",
      headers: { "x-webhook-secret": "test-webhook-secret" },
      body: { userId: TEST_USER.id },
    });
    expect(res.status).toBe(422);
  });
});
