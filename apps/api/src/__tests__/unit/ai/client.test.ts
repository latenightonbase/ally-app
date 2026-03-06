import { describe, it, expect } from "bun:test";

describe("AI Client", () => {
  it("AIError has correct properties", () => {
    const { AIError } = require("../../../ai/client");
    const err = new AIError("test error", 503, true);
    expect(err.message).toBe("test error");
    expect(err.statusCode).toBe(503);
    expect(err.retryable).toBe(true);
    expect(err.name).toBe("AIError");
  });

  it("AIError defaults to 503 and non-retryable", () => {
    const { AIError } = require("../../../ai/client");
    const err = new AIError("down");
    expect(err.statusCode).toBe(503);
    expect(err.retryable).toBe(false);
  });

  it("callClaude returns mocked response", async () => {
    const { callClaude } = require("../../../ai/client");
    const result = await callClaude({
      system: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.text).toBeDefined();
    expect(typeof result.tokensUsed).toBe("number");
  });

  it("callClaudeStructured returns parsed data", async () => {
    const { callClaudeStructured } = require("../../../ai/client");
    const result = await callClaudeStructured({
      system: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.data).toBeDefined();
    expect(typeof result.tokensUsed).toBe("number");
  });

  it("isClaudeReachable returns boolean", async () => {
    const { isClaudeReachable } = require("../../../ai/client");
    const reachable = await isClaudeReachable();
    expect(typeof reachable).toBe("boolean");
  });
});
