import { describe, it, expect } from "bun:test";
import { generateReply, generateReplyStreaming } from "../../../ai/conversation";

describe("AI Conversation", () => {
  const baseInput = {
    message: "I'm stressed about work",
    profile: null,
    relevantFacts: [],
    conversationHistory: [],
  };

  it("generateReply returns a response string", async () => {
    const result = await generateReply(baseInput);
    expect(typeof result.response).toBe("string");
    expect(result.response.length).toBeGreaterThan(0);
    expect(typeof result.tokensUsed).toBe("number");
  });

  it("generateReply passes conversation history", async () => {
    const result = await generateReply({
      ...baseInput,
      conversationHistory: [
        { role: "user", content: "Hi" },
        { role: "ally", content: "Hey there!" },
      ],
    });
    expect(result.response).toBeDefined();
  });

  it("generateReply includes profile context", async () => {
    const result = await generateReply({
      ...baseInput,
      profile: {
        userId: "test",
        version: 2,
        personalInfo: {
          preferredName: "Test",
          fullName: "Test User",
          age: null,
          birthday: null,
          location: null,
          livingSituation: null,
          other: {},
        },
        relationships: [],
        work: { role: null, company: null, companyType: null, currentProjects: [], currentGoals: [], stressors: [], colleagues: [] },
        health: { fitnessGoals: [], currentRoutine: null, sleepNotes: null, dietNotes: null, mentalHealthNotes: null, other: {} },
        interests: [],
        goals: [],
        emotionalPatterns: { primaryStressors: [], copingMechanisms: [], moodTrends: [], recurringThemes: [], sensitivities: [] },
        pendingFollowups: [],
        updatedAt: new Date().toISOString(),
      },
      relevantFacts: [
        { content: "User works at TestCo", category: "work" },
      ],
    });
    expect(result.response).toBeDefined();
  });

  it("generateReplyStreaming calls onToken and returns full text", async () => {
    const tokens: string[] = [];
    const result = await generateReplyStreaming(baseInput, (token) => {
      tokens.push(token);
    });

    expect(tokens.length).toBeGreaterThan(0);
    expect(typeof result.response).toBe("string");
    expect(result.response.length).toBeGreaterThan(0);
  });
});
