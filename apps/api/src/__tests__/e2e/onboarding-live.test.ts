import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { onboardingRoutes } from "../../routes/onboarding";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { e2eCleanup, e2eSeedUser, E2E_SESSION_TOKEN, E2E_USER_ID } from "./helpers";

function createApp() {
  return new Elysia()
    .use(cors({ origin: true }))
    .onError(({ error, set }) => {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as unknown as { message: string }).message)
          : "Internal server error";
      const status = typeof set.status === "number" ? set.status : 500;
      return { error: { code: "INTERNAL_ERROR", message, status } };
    })
    .use(onboardingRoutes);
}

const BASE_CONVERSATION = [
  {
    question: "What's your name and how should I call you?",
    answer: "I'm Alex, you can call me Al. Nice to meet you!",
  },
  {
    question: "What's your life like right now?",
    answer:
      "I'm a software engineer at a startup in San Francisco. Living alone, moved here from Austin last year.",
  },
  {
    question: "What are you focused on right now?",
    answer:
      "Trying to get promoted to senior engineer. Also training for my first half marathon in June.",
  },
  {
    question: "What do you want from Ally?",
    answer: "I want someone who remembers what I tell them and checks in on me. Like a friend who pays attention.",
  },
];

describe("Onboarding Live (real Claude)", () => {
  let app: ReturnType<typeof createApp>;
  const token = E2E_SESSION_TOKEN;

  beforeAll(async () => {
    await e2eCleanup();
    await e2eSeedUser();
    app = createApp();
  });

  afterAll(async () => {
    await e2eCleanup();
  });

  it("complete: returns a personalized greeting and creates a memory profile", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userName: "Alex",
          allyName: "Ally",
          conversation: BASE_CONVERSATION,
          dailyPingTime: "9:00 AM",
          timezone: "America/Los_Angeles",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { greeting: string; memoryProfileCreated: boolean };

    expect(body.greeting).toBeDefined();
    expect(typeof body.greeting).toBe("string");
    expect(body.greeting.length).toBeGreaterThan(20);
    expect(body.memoryProfileCreated).toBe(true);

    const lower = body.greeting.toLowerCase();
    const mentionsName = lower.includes("alex") || lower.includes("al");
    expect(mentionsName).toBe(true);
  });

  it("stores a meaningful profile in the database", async () => {
    const profile = await db.query.memoryProfiles.findFirst({
      where: eq(schema.memoryProfiles.userId, E2E_USER_ID),
    });

    expect(profile).toBeDefined();
    const p = profile!.profile;
    expect(p.personalInfo.preferredName).toBeTruthy();
    expect(p.version).toBe(2);
  });

  it("complete: handles varied user profiles", async () => {
    await e2eCleanup();
    await e2eSeedUser();

    const token2 = E2E_SESSION_TOKEN;
    const res = await app.handle(
      new Request("http://localhost/api/v1/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token2}`,
        },
        body: JSON.stringify({
          userName: "Priya",
          allyName: "Ally",
          conversation: [
            { question: "What's your name?", answer: "Call me Priya" },
            {
              question: "What's going on in your life?",
              answer: "College student studying biology, living with roommates",
            },
            {
              question: "What stresses you out?",
              answer: "Finals are coming up and I'm stressed about organic chemistry",
            },
          ],
          dailyPingTime: "8:00 AM",
          timezone: "America/New_York",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { greeting: string; memoryProfileCreated: boolean };
    expect(body.greeting).toBeDefined();
    expect(body.greeting.length).toBeGreaterThan(10);
  });

  it("followup: returns contextual follow-up questions", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/onboarding/followup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userName: "Alex",
          allyName: "Ally",
          conversation: BASE_CONVERSATION.slice(0, 2),
          dynamicRound: 1,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { questions: unknown[]; summary: string };
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.questions.length).toBeGreaterThanOrEqual(2);
    expect(body.questions.length).toBeLessThanOrEqual(3);
    expect(typeof body.summary).toBe("string");
    expect(body.summary.length).toBeGreaterThan(10);
  });
});
