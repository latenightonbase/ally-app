import { mock } from "bun:test";
import { resolve } from "path";

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
    callClaudeStructured: mock(async () => ({
      data: {
        greeting: "Hey! Great to meet you.",
        memoryProfile: {
          personalInfo: { preferredName: "Test", fullName: "Test User", location: null, livingSituation: null },
          relationships: [],
          work: { role: null, company: null, stressors: [], currentGoals: [] },
          goals: [],
          emotionalPatterns: { primaryStressors: [], copingMechanisms: [] },
        },
        briefingTime: "08:00",
        facts: [],
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
    isVoyageReachable: mock(async () => true),
  };

  const clientPath = resolve(import.meta.dir, "../ai/client.ts");
  const embeddingPath = resolve(import.meta.dir, "../services/embedding.ts");

  mock.module(clientPath, () => aiClientMock);
  mock.module(embeddingPath, () => embeddingMock);

  mock.module("../ai/client", () => aiClientMock);
  mock.module("../services/embedding", () => embeddingMock);
  mock.module("../../ai/client", () => aiClientMock);
  mock.module("../../services/embedding", () => embeddingMock);
  mock.module("../../../ai/client", () => aiClientMock);
  mock.module("../../../services/embedding", () => embeddingMock);
}
