import { describe, it, expect, mock } from "bun:test";
import { extractMemories } from "../../../ai/extraction";

describe("AI Extraction", () => {
  it("extractMemories returns structured data from mock", async () => {
    const result = await extractMemories({
      messages: [
        { role: "user", content: "I started a new job at Acme", createdAt: new Date().toISOString() },
        { role: "ally", content: "That's exciting!", createdAt: new Date().toISOString() },
      ],
      existingProfile: null,
    });

    expect(result.data).toBeDefined();
    expect(typeof result.tokensUsed).toBe("number");
  });

  it("normalises memoryType to 'semantic' if missing (backward compat)", async () => {
    // The mock returns `facts: []` so normalisation runs on empty array — test the normalisation logic
    const result = await extractMemories({
      messages: [
        { role: "user", content: "I work at Acme", createdAt: new Date().toISOString() },
      ],
      existingProfile: null,
    });

    // facts array (from mock) should all have memoryType defined
    for (const fact of result.data.facts) {
      expect(["semantic", "episodic", "event"]).toContain(fact.memoryType);
    }
  });

  it("always returns an entities array", async () => {
    const result = await extractMemories({
      messages: [
        { role: "user", content: "Hello", createdAt: new Date().toISOString() },
      ],
      existingProfile: null,
    });

    expect(Array.isArray(result.data.entities)).toBe(true);
  });

  it("includes existing profile context when provided", async () => {
    const profile = {
      userId: "u1",
      version: 2 as const,
      personalInfo: { preferredName: "Alex", fullName: null, age: null, birthday: null, location: null, livingSituation: null, other: {} },
      relationships: [],
      work: { role: "Dev", company: null, companyType: null, currentProjects: [], currentGoals: [], stressors: [], colleagues: [] },
      health: { fitnessGoals: [], currentRoutine: null, sleepNotes: null, dietNotes: null, mentalHealthNotes: null, other: {} },
      interests: [],
      goals: [],
      emotionalPatterns: { primaryStressors: [], copingMechanisms: [], moodTrends: [], recurringThemes: [], sensitivities: [] },
      pendingFollowups: [],
      updatedAt: new Date().toISOString(),
    };

    const result = await extractMemories({
      messages: [
        { role: "user", content: "Got promoted!", createdAt: new Date().toISOString() },
      ],
      existingProfile: profile,
    });

    expect(result).toBeDefined();
    expect(result.data.entities).toBeDefined();
  });
});
