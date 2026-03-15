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
import { e2eCleanup, e2eSeedUser, E2E_SESSION_TOKEN, E2E_USER_ID } from "./helpers";
import { ensureCollection } from "../../services/vectorStore";

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
  const token = E2E_SESSION_TOKEN;

  beforeAll(async () => {
    await e2eCleanup();
    await e2eSeedUser();
    await ensureCollection();
    app = createApp();
  });

  afterAll(async () => {
    await e2eCleanup();
  });

  it("full loop: onboard -> chat -> extract -> retrieve -> chat with context", async () => {
    // --- Step 1: Onboard ---
    const onboardRes = await app.handle(
      new Request("http://localhost/api/v1/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userName: "Alex",
          allyName: "Ally",
          conversation: [
            { question: "What's your name?", answer: "I'm Alex, call me Al" },
            { question: "What's your life like?", answer: "Software engineer in SF, living alone, moved from Austin" },
            { question: "What are you focused on?", answer: "Getting promoted and training for a half marathon in June" },
            { question: "What stresses you out?", answer: "Deadlines stress me. Running and talking to my friend Maya help. I have imposter syndrome." },
            { question: "What do you want from Ally?", answer: "A friend who remembers things and checks in on me" },
          ],
          dailyPingTime: "9:00 AM",
          timezone: "America/Los_Angeles",
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
    // Use statements that generate high-confidence SEMANTIC facts (persistent traits/relationships),
    // not episodic events. Episodic facts (one-time occurrences) are filtered by storeExtractedFacts.
    const chat1Res = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: "I really love bouldering — I go every weekend at the climbing gym. It's my favourite way to decompress from work stress.",
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
          message: "My best friend from college is Sam — we've been close for 8 years. She lives in Seattle but we video-call every Sunday.",
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

    // --- Step 5: Verify facts are stored ---
    const storedFacts = await db.query.memoryFacts.findMany({
      where: eq(schema.memoryFacts.userId, E2E_USER_ID),
    });
    expect(storedFacts.length).toBeGreaterThan(0);

    // --- Step 6: Verify retrieval works against the new facts ---
    const retrieved = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "climbing hobbies and close friends",
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
          message: "Do you remember what I told you about my hobbies?",
        }),
      }),
    );

    expect(chat3Res.status).toBe(200);
    const chat3Body = (await chat3Res.json()) as any;
    expect(chat3Body.response.length).toBeGreaterThan(10);

    const lower = chat3Body.response.toLowerCase();
    const hasContext =
      lower.includes("climb") ||
      lower.includes("boulder") ||
      lower.includes("gym") ||
      lower.includes("hobby") ||
      lower.includes("weekend") ||
      lower.includes("sam") ||
      lower.includes("friend");
    expect(hasContext).toBe(true);
  });
});
