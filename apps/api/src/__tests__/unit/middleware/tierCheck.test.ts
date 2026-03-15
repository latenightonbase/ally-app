import { describe, it, expect, beforeAll } from "bun:test";
import { Elysia } from "elysia";
import { authMiddleware } from "../../../middleware/auth";
import { requireTier } from "../../../middleware/tierCheck";
import { signTestToken } from "../../helpers/jwt";

function createTierTestApp() {
  return new Elysia()
    .use(authMiddleware)
    .use(requireTier({ requiredTiers: ["basic", "premium"], featureName: "Test Feature" }))
    .get("/test", () => ({ ok: true }));
}

describe("Tier Check Middleware", () => {
  let app: ReturnType<typeof createTierTestApp>;

  beforeAll(() => {
    app = createTierTestApp();
  });

  it("passes for an allowed tier (basic)", async () => {
    const token = await signTestToken({ sub: "u1", tier: "basic" });
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("passes for an allowed tier (premium)", async () => {
    const token = await signTestToken({ sub: "u1", tier: "premium" });
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 for a disallowed tier (free_trial)", async () => {
    const token = await signTestToken({ sub: "u1", tier: "free_trial" });
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for a disallowed tier (free_trial when gate requires basic+)", async () => {
    const token = await signTestToken({ sub: "u1", tier: "free_trial" });
    const app403 = new Elysia()
      .use(authMiddleware)
      .use(requireTier({ requiredTiers: ["basic", "premium"], featureName: "Test Feature" }))
      .get("/test", () => ({ ok: true }));
    const res = await app403.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("error message includes the feature name", async () => {
    const token = await signTestToken({ sub: "u1", tier: "free_trial" });
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toContain("Test Feature");
  });
});
