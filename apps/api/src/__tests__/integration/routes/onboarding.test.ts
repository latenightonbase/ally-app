import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, authedRequest, json } from "../../helpers/app";
import { signTestToken, TEST_USER } from "../../helpers/jwt";
import { truncateAll, seedUsers } from "../../helpers/seed";

const VALID_ANSWERS = {
  answers: {
    nameAndGreeting: "I'm Test, call me T",
    lifeContext: "Software engineer in SF",
    currentFocus: "Shipping a product",
    stressAndSupport: "Deadlines stress me. I run to decompress.",
    allyExpectations: "Check in on me and remember things",
  },
};

describe("POST /api/v1/onboarding", () => {
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

  it("returns greeting and creates memory profile", async () => {
    const res = await authedRequest(app, "/api/v1/onboarding", token, {
      method: "POST",
      body: VALID_ANSWERS,
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.greeting).toBeDefined();
    expect(typeof body.greeting).toBe("string");
    expect(body.memoryProfileCreated).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_ANSWERS),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 422 when answers are missing fields", async () => {
    const res = await authedRequest(app, "/api/v1/onboarding", token, {
      method: "POST",
      body: { answers: { nameAndGreeting: "Hi" } },
    });
    expect(res.status).toBe(422);
  });
});
