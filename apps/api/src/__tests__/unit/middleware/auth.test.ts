import { describe, it, expect, beforeAll } from "bun:test";
import { Elysia } from "elysia";
import { authMiddleware } from "../../../middleware/auth";
import { signTestToken, signExpiredToken } from "../../helpers/jwt";

function createAuthTestApp() {
  return new Elysia()
    .use(authMiddleware)
    .get("/test", ({ user }) => ({ userId: user.id, tier: user.tier }));
}

describe("Auth Middleware", () => {
  let app: ReturnType<typeof createAuthTestApp>;

  beforeAll(() => {
    app = createAuthTestApp();
  });

  it("passes with a valid token", async () => {
    const token = await signTestToken({ sub: "user-123", tier: "pro" });
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.userId).toBe("user-123");
    expect(body.tier).toBe("pro");
  });

  it("returns 401 when no Authorization header", async () => {
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header has wrong format", async () => {
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: "Basic abc123" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const token = await signExpiredToken("user-123");
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for a garbage token", async () => {
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: "Bearer not.a.real.jwt" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("extracts all user fields from the token", async () => {
    const token = await signTestToken({
      sub: "user-456",
      email: "hello@test.com",
      tier: "premium",
      trialEndsAt: "2026-12-01",
    });
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.userId).toBe("user-456");
    expect(body.tier).toBe("premium");
  });
});
