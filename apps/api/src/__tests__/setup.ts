import { mock } from "bun:test";
import { resolve } from "path";
import { jwtVerify } from "jose";

const isE2E = process.env.ALLY_E2E === "1";

const envFileName = isE2E ? ".env.test.live" : ".env.test";
const envPath = resolve(import.meta.dir, `../../${envFileName}`);
const envFile = Bun.file(envPath);
if (await envFile.exists()) {
  const text = await envFile.text();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (isE2E || !process.env[key]) {
      process.env[key] = value;
    }
  }
} else if (isE2E) {
  console.error(
    "E2E tests require apps/api/.env.test.live with real API keys.\n" +
    "Copy .env.test.live.example and fill in your keys.",
  );
  process.exit(1);
}

process.env.NODE_ENV = "test";

if (!isE2E) {
  const zeroVector = new Array(1024).fill(0);

  class AIError extends Error {
    statusCode: number;
    retryable: boolean;
    constructor(message: string, statusCode = 503, retryable = false) {
      super(message);
      this.name = "AIError";
      this.statusCode = statusCode;
      this.retryable = retryable;
    }
  }

  const aiClientMock = {
    MODEL: "claude-sonnet-4-6",
    AIError,
    callClaude: mock(async () => ({
      text: "Mock Ally response",
      tokensUsed: 100,
    })),
    callClaudeStreaming: mock(async (opts: any) => {
      opts.onToken("Mock ");
      opts.onToken("streamed ");
      opts.onToken("response");
      return { fullText: "Mock streamed response", tokensUsed: 80 };
    }),
    callClaudeWithTools: mock(async () => ({
      text: "Mock Ally response",
      tokensUsed: 90,
    })),
    callClaudeStreamingWithTools: mock(async (opts: any) => {
      if (opts.onToken) {
        opts.onToken("Mock ");
        opts.onToken("streaming ");
        opts.onToken("tools ");
        opts.onToken("response");
      }
      return { fullText: "Mock streaming tools response", tokensUsed: 85 };
    }),
    callClaudeStructured: mock(async () => ({
      data: {
        // onboarding/complete shape
        greeting: "Hey! Great to meet you.",
        memoryProfile: {
          personalInfo: { preferredName: "Test", fullName: "Test User", location: null, livingSituation: null },
          relationships: [],
          work: { role: null, company: null, stressors: [], currentGoals: [] },
          goals: [],
          emotionalPatterns: { primaryStressors: [], copingMechanisms: [] },
        },
        briefingTime: "08:00",
        // onboarding/followup shape
        questions: [{ question: "What is your main goal right now?", purpose: "understanding goals" }],
        summary: "The user is getting started.",
        memoryUpdates: {},
        // legacy fields
        facts: [],
        entities: [],
        followups: [],
        profileUpdates: {},
      },
      tokensUsed: 150,
    })),
    isClaudeReachable: mock(async () => true),
  };

  const embeddingMock = {
    generateEmbedding: mock(async () => [...zeroVector]),
    generateEmbeddings: mock(async (texts: string[]) =>
      texts.map(() => [...zeroVector]),
    ),
    addContextualPrefix: (text: string, _category?: string) => `User memory: ${text}`,
    isVoyageReachable: mock(async () => true),
  };

  const vectorStoreMock = {
    ensureCollection: mock(async () => {}),
    upsertMemory: mock(async () => {}),
    batchUpsertMemories: mock(async () => {}),
    deleteMemory: mock(async () => {}),
    batchDeleteMemories: mock(async () => {}),
    searchMemory: mock(async () => []),
    searchMemoryByKeyword: mock(async () => []),
    scoreMemoryResults: (_results: any[], _weights?: any, _emotionHint?: string) => [],
    batchUpdateImportance: mock(async () => {}),
    updatePayload: mock(async () => {}),
  };

  const graphStoreMock = {
    upsertEntity: mock(async () => "mock-entity-id"),
    createEdge: mock(async () => {}),
    getEntityLinkedIds: mock(async () => ({ factIds: [], episodeIds: [] })),
    getRelatedEntities: mock(async () => []),
    extractEntityNamesFromText: (_text: string) => [] as string[],
    deleteUserGraph: mock(async () => {}),
  };

  const TEST_JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET ?? "test-jwt-secret-for-testing-only",
  );

  const authMock = {
    auth: {
      api: {
        getSession: mock(async (opts: { headers: Headers }) => {
          const authHeader = opts.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) return null;
          const token = authHeader.slice(7);
          try {
            const { payload } = await jwtVerify(token, TEST_JWT_SECRET);
              return {
                user: {
                  id: payload.sub as string,
                  email: (payload.email as string) ?? "test@example.com",
                  tier: (payload.tier as string) ?? "basic",
                },
              session: { id: "test-session-id" },
            };
          } catch {
            return null;
          }
        }),
        handler: mock(async () => new Response("OK", { status: 200 })),
      },
    },
  };

  const clientPath = resolve(import.meta.dir, "../ai/client.ts");
  const embeddingPath = resolve(import.meta.dir, "../services/embedding.ts");
  const vectorStorePath = resolve(import.meta.dir, "../services/vectorStore.ts");
  const graphStorePath = resolve(import.meta.dir, "../services/graphStore.ts");
  const authLibPath = resolve(import.meta.dir, "../lib/auth.ts");

  mock.module(clientPath, () => aiClientMock);
  mock.module(embeddingPath, () => embeddingMock);
  mock.module(vectorStorePath, () => vectorStoreMock);
  mock.module(graphStorePath, () => graphStoreMock);
  mock.module(authLibPath, () => authMock);

  mock.module("../ai/client", () => aiClientMock);
  mock.module("../services/embedding", () => embeddingMock);
  mock.module("../services/vectorStore", () => vectorStoreMock);
  mock.module("../services/graphStore", () => graphStoreMock);
  mock.module("../lib/auth", () => authMock);
  mock.module("../../ai/client", () => aiClientMock);
  mock.module("../../services/embedding", () => embeddingMock);
  mock.module("../../services/vectorStore", () => vectorStoreMock);
  mock.module("../../services/graphStore", () => graphStoreMock);
  mock.module("../../lib/auth", () => authMock);
  mock.module("../../../ai/client", () => aiClientMock);
  mock.module("../../../services/embedding", () => embeddingMock);
  mock.module("../../../services/vectorStore", () => vectorStoreMock);
  mock.module("../../../services/graphStore", () => graphStoreMock);
  mock.module("../../../lib/auth", () => authMock);
}
