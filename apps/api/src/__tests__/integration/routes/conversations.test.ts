import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, authedRequest, json } from "../../helpers/app";
import { signTestToken, TEST_USER, TEST_FREE_USER } from "../../helpers/jwt";
import { truncateAll, seedUsers, seedConversation } from "../../helpers/seed";

describe("Conversation Routes", () => {
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

  describe("GET /api/v1/conversations", () => {
    it("returns empty list when no conversations exist", async () => {
      const res = await authedRequest(app, "/api/v1/conversations", token);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.conversations).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns conversations with metadata", async () => {
      await seedConversation(TEST_USER.id, 4);
      await seedConversation(TEST_USER.id, 2);

      const res = await authedRequest(app, "/api/v1/conversations", token);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.conversations.length).toBe(2);
      expect(body.total).toBe(2);

      const conv = body.conversations[0];
      expect(conv.id).toBeDefined();
      expect(conv.preview).toBeDefined();
      expect(conv.createdAt).toBeDefined();
      expect(conv.lastMessageAt).toBeDefined();
    });

    it("paginates correctly", async () => {
      for (let i = 0; i < 5; i++) {
        await seedConversation(TEST_USER.id, 1);
      }

      const res = await authedRequest(app, "/api/v1/conversations?limit=2&offset=2", token);
      const body = await json(res);
      expect(body.conversations.length).toBe(2);
      expect(body.total).toBe(5);
    });
  });

  describe("GET /api/v1/conversations/:conversationId", () => {
    it("returns messages for a conversation", async () => {
      const { conversation } = await seedConversation(TEST_USER.id, 4);

      const res = await authedRequest(
        app,
        `/api/v1/conversations/${conversation.id}`,
        token,
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.conversationId).toBe(conversation.id);
      expect(body.messages.length).toBe(4);
      expect(body.messages[0].role).toBeDefined();
      expect(body.messages[0].content).toBeDefined();
    });

    it("returns 404 for non-existent conversation", async () => {
      const fakeId = "00000000-0000-0000-0000-ffffffffffff";
      const res = await authedRequest(
        app,
        `/api/v1/conversations/${fakeId}`,
        token,
      );
      expect(res.status).toBe(404);
    });

    it("does not return another user's conversation", async () => {
      const { conversation } = await seedConversation(TEST_USER.id, 2);

      const otherToken = await signTestToken({
        sub: TEST_FREE_USER.id,
        tier: "free_trial",
      });

      const res = await authedRequest(
        app,
        `/api/v1/conversations/${conversation.id}`,
        otherToken,
      );
      expect(res.status).toBe(404);
    });

    it("supports pagination with before parameter", async () => {
      const { messages } = await seedConversation(TEST_USER.id, 6);
      const midMessage = messages[3];

      const res = await authedRequest(
        app,
        `/api/v1/conversations/${messages[0].conversationId}?before=${midMessage.id}&limit=2`,
        token,
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.messages.length).toBeLessThanOrEqual(2);
    });
  });
});
