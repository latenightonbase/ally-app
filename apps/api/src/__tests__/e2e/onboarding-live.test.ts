import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { onboardingRoutes } from "../../routes/onboarding";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { e2eCleanup, e2eSeedUser, E2E_USER_ID } from "./helpers";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

async function makeToken() {
  return new SignJWT({ email: "e2e@ally-test.com", tier: "pro" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(E2E_USER_ID)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
}

function createApp() {
  return new Elysia()
    .use(cors({ origin: true }))
    .onError(({ error, set }) => {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as any).message)
          : "Internal server error";
      const status = typeof set.status === "number" ? set.status : 500;
      return { error: { code: "INTERNAL_ERROR", message, status } };
    })
    .use(onboardingRoutes);
}

describe("Onboarding Live (real Claude)", () => {
  let app: ReturnType<typeof createApp>;
  let token: string;

  beforeAll(async () => {
    await e2eCleanup();
    await e2eSeedUser();
    app = createApp();
    token = await makeToken();
  });

  afterAll(async () => {
    await e2eCleanup();
  });

  it("returns a personalized greeting and creates a memory profile", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          answers: {
            nameAndGreeting: "I'm Alex, you can call me Al. Nice to meet you!",
            lifeContext: "I'm a software engineer at a startup in San Francisco. Living alone, moved here from Austin last year.",
            currentFocus: "Trying to get promoted to senior engineer. Also training for my first half marathon in June.",
            stressAndSupport: "Work deadlines stress me out a lot. I cope by running and talking to my best friend Maya. I also struggle with imposter syndrome sometimes.",
            allyExpectations: "I want someone who remembers what I tell them and checks in on me. Like a friend who pays attention.",
          },
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;

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

  it("handles varied onboarding answers", async () => {
    await e2eCleanup();
    await e2eSeedUser();

    const res = await app.handle(
      new Request("http://localhost/api/v1/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          answers: {
            nameAndGreeting: "Call me Priya",
            lifeContext: "College student studying biology, living with roommates",
            currentFocus: "Finals are coming up and I'm stressed about organic chemistry",
            stressAndSupport: "I stress-eat and watch comfort shows. My mom is my biggest support.",
            allyExpectations: "Just someone to vent to honestly",
          },
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.greeting).toBeDefined();
    expect(body.greeting.length).toBeGreaterThan(10);
  });
});
