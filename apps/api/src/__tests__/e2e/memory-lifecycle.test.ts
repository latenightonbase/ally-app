import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { chatRoutes } from "../../routes/chat";
import { onboardingRoutes } from "../../routes/onboarding";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { extractMemories } from "../../ai/extraction";
import { storeExtractedFacts, addFollowups } from "../../services/memory";
import { loadMemoryProfile, retrieveRelevantFacts } from "../../services/retrieval";
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
    .use(onboardingRoutes)
    .use(chatRoutes);
}

describe("Memory Lifecycle (golden path)", () => {
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

  it("full loop: onboard -> chat -> extract -> retrieve -> chat with context", async () => {
    // --- Step 1: Onboard ---
    const onboardRes = await app.handle(
      new Request("http://localhost/api/v1/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          answers: {
            nameAndGreeting: "I'm Alex, call me Al",
            lifeContext: "Software engineer in SF, living alone, moved from Austin",
            currentFocus: "Getting promoted and training for a half marathon in June",
            stressAndSupport: "Deadlines stress me. Running and talking to my friend Maya help. I have imposter syndrome.",
            allyExpectations: "A friend who remembers things and checks in on me",
          },
        }),
      }),
    );

    expect(onboardRes.status).toBe(201);
    const onboardBody = (await onboardRes.json()) as any;
    expect(onboardBody.greeting).toBeDefined();
    expect(onboardBody.memoryProfileCreated).toBe(true);

    const profile = await loadMemoryProfile(E2E_USER_ID);
    expect(profile).not.toBeNull();

    // --- Step 2: First chat ---
    const chat1Res = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: "Hey! I just had a really tough on-call shift. A P0 incident at 3am and I couldn't sleep after.",
        }),
      }),
    );

    expect(chat1Res.status).toBe(200);
    const chat1Body = (await chat1Res.json()) as any;
    expect(chat1Body.response.length).toBeGreaterThan(10);
    const convId = chat1Body.conversationId;

    // --- Step 3: Second chat in same conversation ---
    const chat2Res = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: "Yeah it was bad. Sam (my manager) was understanding about it at least. I'm thinking of taking Friday off to recover.",
          conversationId: convId,
        }),
      }),
    );

    expect(chat2Res.status).toBe(200);
    const chat2Body = (await chat2Res.json()) as any;
    expect(chat2Body.conversationId).toBe(convId);

    // --- Step 4: Run extraction (simulates nightly job) ---
    const messages = await db.query.messages.findMany({
      where: eq(schema.messages.conversationId, convId),
      orderBy: [schema.messages.createdAt],
    });

    expect(messages.length).toBeGreaterThanOrEqual(4);

    const { data: extractionData } = await extractMemories({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      existingProfile: profile,
    });

    expect(extractionData.facts.length).toBeGreaterThan(0);

    await storeExtractedFacts(E2E_USER_ID, extractionData.facts, convId);
    if (extractionData.followups.length > 0) {
      await addFollowups(E2E_USER_ID, extractionData.followups);
    }

    // --- Step 5: Verify facts are stored with embeddings ---
    const storedFacts = await db.query.memoryFacts.findMany({
      where: eq(schema.memoryFacts.userId, E2E_USER_ID),
    });
    expect(storedFacts.length).toBeGreaterThan(0);
    expect(storedFacts.every((f) => f.embedding !== null)).toBe(true);

    // --- Step 6: Verify retrieval works against the new facts ---
    const retrieved = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "on-call incident and sleep problems",
      limit: 5,
    });
    expect(retrieved.length).toBeGreaterThan(0);

    // --- Step 7: New chat should have context from extracted facts ---
    const chat3Res = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: "Hey, did you remember what happened to me at work recently?",
        }),
      }),
    );

    expect(chat3Res.status).toBe(200);
    const chat3Body = (await chat3Res.json()) as any;
    expect(chat3Body.response.length).toBeGreaterThan(10);

    const lower = chat3Body.response.toLowerCase();
    const hasContext =
      lower.includes("on-call") ||
      lower.includes("incident") ||
      lower.includes("shift") ||
      lower.includes("p0") ||
      lower.includes("sleep") ||
      lower.includes("3am") ||
      lower.includes("sam") ||
      lower.includes("friday");
    expect(hasContext).toBe(true);
  });
});
