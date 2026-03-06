import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, authedRequest, json } from "../../helpers/app";
import { signTestToken, TEST_USER } from "../../helpers/jwt";
import { truncateAll, seedUsers } from "../../helpers/seed";

describe("POST /api/v1/chat", () => {
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

  it("creates a new conversation when no conversationId provided", async () => {
    const res = await authedRequest(app, "/api/v1/chat", token, {
      method: "POST",
      body: { message: "Hello Ally!" },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.response).toBeDefined();
    expect(body.conversationId).toBeDefined();
    expect(body.messageId).toBeDefined();
  });

  it("continues an existing conversation", async () => {
    const res1 = await authedRequest(app, "/api/v1/chat", token, {
      method: "POST",
      body: { message: "First message" },
    });
    const { conversationId } = await json(res1);

    const res2 = await authedRequest(app, "/api/v1/chat", token, {
      method: "POST",
      body: { message: "Second message", conversationId },
    });
    const body2 = await json(res2);

    expect(res2.status).toBe(200);
    expect(body2.conversationId).toBe(conversationId);
  });

  it("returns 401 without auth", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 422 when message is missing", async () => {
    const res = await authedRequest(app, "/api/v1/chat", token, {
      method: "POST",
      body: {},
    });
    expect(res.status).toBe(422);
  });

  it("supports SSE streaming response", async () => {
    const res = await authedRequest(app, "/api/v1/chat", token, {
      method: "POST",
      body: { message: "Stream test", stream: true },
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("data:");
    expect(text).toContain('"type":"token"');
    expect(text).toContain('"type":"done"');
  });
});
