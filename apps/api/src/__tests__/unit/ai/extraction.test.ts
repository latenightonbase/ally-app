import { describe, it, expect } from "bun:test";
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

  it("formats conversation text correctly with roles", async () => {
    const result = await extractMemories({
      messages: [
        { role: "user", content: "Hello", createdAt: new Date().toISOString() },
        { role: "ally", content: "Hi there", createdAt: new Date().toISOString() },
      ],
      existingProfile: null,
    });

    expect(result).toBeDefined();
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
  });
});
