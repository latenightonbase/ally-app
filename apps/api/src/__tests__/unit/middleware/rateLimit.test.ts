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
    const token = await signTestToken({ sub: "rate-test-1", tier: "basic" });
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
    // basic tier has requestsPerMinute: 30 — send 31 to breach it
    const token = await signTestToken({ sub: userId, tier: "basic" });

    let lastRes: Response | null = null;
    for (let i = 0; i < 31; i++) {
      lastRes = await app.handle(
        new Request("http://localhost/test", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
    }

    expect(lastRes!.status).toBe(429);
  });

  it("premium users have higher burst limit than basic users", async () => {
    // basic: 30 rpm, premium: 60 rpm
    const basicToken = await signTestToken({ sub: "rate-basic-burst", tier: "basic" });
    const premiumToken = await signTestToken({ sub: "rate-premium-burst", tier: "premium" });

    // Send 31 requests — exceeds basic (30) but not premium (60)
    for (let i = 0; i < 31; i++) {
      await app.handle(
        new Request("http://localhost/test", {
          headers: { Authorization: `Bearer ${basicToken}` },
        }),
      );
      await app.handle(
        new Request("http://localhost/test", {
          headers: { Authorization: `Bearer ${premiumToken}` },
        }),
      );
    }

    const basicRes = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${basicToken}` },
      }),
    );
    const premiumRes = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${premiumToken}` },
      }),
    );

    expect(basicRes.status).toBe(429);
    expect(premiumRes.status).toBe(200);
  });
});
