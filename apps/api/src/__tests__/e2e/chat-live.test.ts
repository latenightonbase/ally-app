import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { chatRoutes } from "../../routes/chat";
import { healthRoutes } from "../../routes/health";
import { db, schema } from "../../db";
import { generateEmbeddings } from "../../services/embedding";
import { SignJWT } from "jose";
import { e2eCleanup, e2eSeedUser, buildE2EProfile, E2E_USER_ID } from "./helpers";

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
    .use(healthRoutes)
    .use(chatRoutes);
}

const MEMORY_FACTS = [
  { content: "Alex's best friend Maya works at the same startup", category: "relationships" as const, importance: 0.8 },
  { content: "Alex has a big presentation to leadership on Monday", category: "work" as const, importance: 0.9 },
  { content: "Alex is training for a half marathon", category: "health" as const, importance: 0.7 },
];

describe("Chat Live (real Claude + Voyage)", () => {
  let app: ReturnType<typeof createApp>;
  let token: string;

  beforeAll(async () => {
    await e2eCleanup();
    await e2eSeedUser();

    const profile = buildE2EProfile();
    await db
      .insert(schema.memoryProfiles)
      .values({ userId: E2E_USER_ID, profile })
      .onConflictDoNothing();

    const embeddings = await generateEmbeddings(MEMORY_FACTS.map((f) => f.content));
    for (let i = 0; i < MEMORY_FACTS.length; i++) {
      await db.insert(schema.memoryFacts).values({
        userId: E2E_USER_ID,
        content: MEMORY_FACTS[i].content,
        category: MEMORY_FACTS[i].category,
        importance: MEMORY_FACTS[i].importance,
        confidence: 0.9,
        embedding: embeddings[i],
      });
    }

    app = createApp();
    token = await makeToken();
  });

  afterAll(async () => {
    await e2eCleanup();
  });

  it("returns a non-empty response with conversationId (non-streaming)", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: "Hey Ally, how's it going?" }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.response).toBeDefined();
    expect(typeof body.response).toBe("string");
    expect(body.response.length).toBeGreaterThan(10);
    expect(body.conversationId).toBeDefined();
    expect(body.messageId).toBeDefined();
  });

  it("references memory context when relevant", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: "I'm really nervous about something at work coming up. Can you help?",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.response.length).toBeGreaterThan(20);
    const lower = body.response.toLowerCase();
    const mentionsContext =
      lower.includes("presentation") ||
      lower.includes("leadership") ||
      lower.includes("work") ||
      lower.includes("monday") ||
      lower.includes("nervous");
    expect(mentionsContext).toBe(true);
  });

  it("returns valid SSE stream with token and done events", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: "Tell me something encouraging",
          stream: true,
        }),
      }),
    );

    expect(res.status).toBe(200);

    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.startsWith("data: "));

    expect(lines.length).toBeGreaterThan(1);

    const events = lines.map((l) => JSON.parse(l.slice(6)));
    const tokenEvents = events.filter((e: any) => e.type === "token");
    const doneEvents = events.filter((e: any) => e.type === "done");

    expect(tokenEvents.length).toBeGreaterThan(0);
    expect(doneEvents.length).toBe(1);

    const done = doneEvents[0] as any;
    expect(done.conversationId).toBeDefined();
    expect(done.messageId).toBeDefined();
    expect(typeof done.fullResponse).toBe("string");
    expect(done.fullResponse.length).toBeGreaterThan(10);

    const reconstructed = tokenEvents.map((e: any) => e.content).join("");
    expect(reconstructed).toBe(done.fullResponse);
  });

  it("continues a conversation with history", async () => {
    const res1 = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: "My name is Alex and I love rock climbing." }),
      }),
    );
    const body1 = (await res1.json()) as any;
    const convId = body1.conversationId;

    const res2 = await app.handle(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: "What did I just tell you my name was?",
          conversationId: convId,
        }),
      }),
    );

    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as any;
    expect(body2.conversationId).toBe(convId);
    expect(body2.response.toLowerCase()).toContain("alex");
  });
});
