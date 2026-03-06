import { describe, it, expect, beforeAll } from "bun:test";
import { Elysia } from "elysia";
import { authMiddleware } from "../../../middleware/auth";
import { rateLimitMiddleware } from "../../../middleware/rateLimit";
import { signTestToken } from "../../helpers/jwt";

function createRateLimitApp() {
  return new Elysia()
    .use(authMiddleware)
    .use(rateLimitMiddleware)
    .get("/test", () => ({ ok: true }))
    .post("/chat-test", ({ ...ctx }) => {
      const rateLimit = (ctx as any).rateLimit;
      rateLimit?.checkMessageLimit();
      return { ok: true };
    });
}

describe("Rate Limit Middleware", () => {
  let app: ReturnType<typeof createRateLimitApp>;

  beforeAll(() => {
    app = createRateLimitApp();
  });

  it("allows requests under the rate limit", async () => {
    const token = await signTestToken({ sub: "rate-test-1", tier: "pro" });
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("includes rate limit headers in response", async () => {
    const token = await signTestToken({ sub: "rate-test-2", tier: "free_trial" });
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
    expect(res.headers.get("x-ratelimit-remaining")).toBeTruthy();
    expect(res.headers.get("x-ratelimit-reset")).toBeTruthy();
  });

  it("returns 429 when minute burst limit is exceeded", async () => {
    const userId = "rate-burst-test";
    const token = await signTestToken({ sub: userId, tier: "free_trial" });

    let lastRes: Response | null = null;
    for (let i = 0; i < 12; i++) {
      lastRes = await app.handle(
        new Request("http://localhost/test", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
    }

    expect(lastRes!.status).toBe(429);
  });

  it("pro users have higher burst limit than free users", async () => {
    const freeToken = await signTestToken({ sub: "rate-free-burst", tier: "free_trial" });
    const proToken = await signTestToken({ sub: "rate-pro-burst", tier: "pro" });

    for (let i = 0; i < 11; i++) {
      await app.handle(
        new Request("http://localhost/test", {
          headers: { Authorization: `Bearer ${freeToken}` },
        }),
      );
      await app.handle(
        new Request("http://localhost/test", {
          headers: { Authorization: `Bearer ${proToken}` },
        }),
      );
    }

    const freeRes = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${freeToken}` },
      }),
    );
    const proRes = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${proToken}` },
      }),
    );

    expect(freeRes.status).toBe(429);
    expect(proRes.status).toBe(200);
  });
});
