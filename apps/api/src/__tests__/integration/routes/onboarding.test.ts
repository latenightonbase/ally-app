import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, authedRequest, json } from "../../helpers/app";
import { signTestToken, TEST_USER } from "../../helpers/jwt";
import { truncateAll, seedUsers } from "../../helpers/seed";

const FOLLOWUP_BODY = {
  userName: "Test",
  allyName: "Ally",
  conversation: [
    {
      question: "What's your name and how should I address you?",
      answer: "I'm Test, call me T",
    },
    {
      question: "What's going on in your life right now?",
      answer: "Software engineer in SF, shipping a product at my startup",
    },
  ],
  dynamicRound: 1,
};

const COMPLETE_BODY = {
  userName: "Test",
  allyName: "Ally",
  conversation: [
    {
      question: "What's your name and how should I address you?",
      answer: "I'm Test, call me T",
    },
    {
      question: "What's going on in your life right now?",
      answer: "Software engineer in SF, shipping a product at my startup",
    },
    {
      question: "What do you want from Ally?",
      answer: "Someone who remembers what I tell them",
    },
  ],
  dailyPingTime: "9:00 AM",
  timezone: "America/New_York",
};

describe("Onboarding Routes", () => {
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

  describe("POST /api/v1/onboarding/followup", () => {
    it("returns questions and summary", async () => {
      const res = await authedRequest(app, "/api/v1/onboarding/followup", token, {
        method: "POST",
        body: FOLLOWUP_BODY,
      });

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(Array.isArray(body.questions)).toBe(true);
      expect(body.questions.length).toBeGreaterThan(0);
      expect(typeof body.summary).toBe("string");
    });

    it("returns 401 without auth", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/onboarding/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(FOLLOWUP_BODY),
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 422 when required fields are missing", async () => {
      const res = await authedRequest(app, "/api/v1/onboarding/followup", token, {
        method: "POST",
        body: { userName: "Test" },
      });
      expect(res.status).toBe(422);
    });
  });

  describe("POST /api/v1/onboarding/complete", () => {
    it("returns greeting and creates memory profile", async () => {
      const res = await authedRequest(app, "/api/v1/onboarding/complete", token, {
        method: "POST",
        body: COMPLETE_BODY,
      });

      expect(res.status).toBe(201);
      const body = await json(res);
      expect(typeof body.greeting).toBe("string");
      expect(body.memoryProfileCreated).toBe(true);
    });

    it("returns 401 without auth", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(COMPLETE_BODY),
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 422 when required fields are missing", async () => {
      const res = await authedRequest(app, "/api/v1/onboarding/complete", token, {
        method: "POST",
        body: { userName: "Test" },
      });
      expect(res.status).toBe(422);
    });
  });

  describe("legacy endpoint removed", () => {
    it("POST /api/v1/onboarding returns 404", async () => {
      const res = await authedRequest(app, "/api/v1/onboarding", token, {
        method: "POST",
        body: {
          answers: {
            nameAndGreeting: "Test",
            lifeContext: "Engineer",
            currentFocus: "Shipping",
            stressAndSupport: "Runs",
            allyExpectations: "Remember me",
          },
        },
      });
      expect(res.status).toBe(404);
    });
  });
});
