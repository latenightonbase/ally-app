import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { extractMemories } from "../../ai/extraction";
import { storeExtractedFacts } from "../../services/memory";
import { retrieveRelevantFacts } from "../../services/retrieval";
import { e2eCleanup, e2eSeedUser, buildE2EProfile, E2E_USER_ID } from "./helpers";

describe("Extraction Pipeline (real Claude + Voyage + pgvector)", () => {
  let conversationId: string;

  beforeAll(async () => {
    await e2eCleanup();
    await e2eSeedUser();

    const profile = buildE2EProfile();
    await db
      .insert(schema.memoryProfiles)
      .values({ userId: E2E_USER_ID, profile })
      .onConflictDoNothing();

    const [conv] = await db
      .insert(schema.conversations)
      .values({ userId: E2E_USER_ID, preview: "E2E extraction test" })
      .returning();
    conversationId = conv.id;

    const messages = [
      { role: "user" as const, content: "Hey Ally, I just got back from my doctor appointment. She said my blood pressure is a bit high and I need to cut back on sodium." },
      { role: "ally" as const, content: "That's important to know. How are you feeling about it? And did she give you any specific recommendations beyond reducing sodium?" },
      { role: "user" as const, content: "I'm a little worried honestly. She wants me to exercise more consistently — said my 3x a week running isn't enough, should be daily movement. Oh and I forgot to tell you, Maya got engaged last weekend! I'm really happy for her." },
      { role: "ally" as const, content: "Wow, congratulations to Maya! That's exciting news. And I hear you on the health stuff — adding daily movement doesn't have to mean daily runs. Even walks count. How do you feel about it?" },
      { role: "user" as const, content: "Yeah you're right. I think I'll start walking to work instead of taking the bus. It's only 20 minutes. And yeah Maya is over the moon, her partner Jake proposed at their favorite restaurant." },
    ];

    for (const msg of messages) {
      await db.insert(schema.messages).values({
        conversationId,
        role: msg.role,
        content: msg.content,
      });
    }
  });

  afterAll(async () => {
    await e2eCleanup();
  });

  it("extracts meaningful facts from a conversation", async () => {
    const messages = await db.query.messages.findMany({
      where: eq(schema.messages.conversationId, conversationId),
      orderBy: [schema.messages.createdAt],
    });

    const profile = buildE2EProfile();
    const { data, tokensUsed } = await extractMemories({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      existingProfile: profile,
    });

    expect(tokensUsed).toBeGreaterThan(0);
    expect(data.facts).toBeDefined();
    expect(Array.isArray(data.facts)).toBe(true);
    expect(data.facts.length).toBeGreaterThan(0);

    for (const fact of data.facts) {
      expect(fact.content).toBeTruthy();
      expect(typeof fact.content).toBe("string");
      expect(fact.category).toBeDefined();
      expect(fact.confidence).toBeGreaterThanOrEqual(0.7);
      expect(fact.importance).toBeGreaterThanOrEqual(0);
      expect(fact.importance).toBeLessThanOrEqual(1);
    }

    const allContent = data.facts.map((f) => f.content.toLowerCase()).join(" ");
    const mentionsHealth =
      allContent.includes("blood pressure") ||
      allContent.includes("sodium") ||
      allContent.includes("doctor");
    const mentionsMaya =
      allContent.includes("maya") || allContent.includes("engaged");

    expect(mentionsHealth || mentionsMaya).toBe(true);
  });

  it("stores extracted facts with real embeddings and retrieves them", async () => {
    const messages = await db.query.messages.findMany({
      where: eq(schema.messages.conversationId, conversationId),
      orderBy: [schema.messages.createdAt],
    });

    const profile = buildE2EProfile();
    const { data } = await extractMemories({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      existingProfile: profile,
    });

    await storeExtractedFacts(E2E_USER_ID, data.facts, conversationId);

    const storedFacts = await db.query.memoryFacts.findMany({
      where: eq(schema.memoryFacts.userId, E2E_USER_ID),
    });

    expect(storedFacts.length).toBeGreaterThan(0);

    const hasEmbeddings = storedFacts.filter((f) => f.embedding !== null);
    expect(hasEmbeddings.length).toBe(storedFacts.length);

    const results = await retrieveRelevantFacts({
      userId: E2E_USER_ID,
      query: "What happened at the doctor?",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
  });

  it("detects follow-ups from emotional content", async () => {
    const { data } = await extractMemories({
      messages: [
        {
          role: "user",
          content: "I'm really worried about my blood pressure results. I haven't been sleeping well either.",
          createdAt: new Date().toISOString(),
        },
        {
          role: "ally",
          content: "That sounds stressful. Let's talk about it more when you're ready.",
          createdAt: new Date().toISOString(),
        },
      ],
      existingProfile: buildE2EProfile(),
    });

    expect(data.followups).toBeDefined();
    expect(Array.isArray(data.followups)).toBe(true);
  });
});
