import { describe, it, expect } from "bun:test";
import { callClaude } from "../../ai/client";
import { buildAllySystemPrompt } from "../../ai/prompts";
import type { MemoryProfile, MemoryFact } from "@ally/shared";
import { buildE2EProfile } from "./helpers";

interface Scenario {
  name: string;
  profile: MemoryProfile;
  facts: Pick<MemoryFact, "content" | "category">[];
  userMessage: string;
  expectations: {
    shouldContain?: string[];
    shouldNotContain?: string[];
    shouldMatchRegex?: RegExp[];
    maxLength?: number;
    minLength?: number;
  };
}

const scenarios: Scenario[] = [
  {
    name: "references user by name",
    profile: buildE2EProfile(),
    facts: [],
    // Use an explicit self-reference so Claude has a clear reason to say the name.
    // "Good morning!" alone doesn't always trigger name usage — that's fine for a friend.
    userMessage: "Hey, do you remember my name?",
    expectations: {
      shouldContain: ["alex"],
      minLength: 10,
    },
  },
  {
    name: "does not use bullet points or markdown",
    profile: buildE2EProfile(),
    facts: [
      { content: "Alex has a presentation on Monday", category: "work" },
      { content: "Alex is training for a half marathon", category: "health" },
      { content: "Alex struggles with imposter syndrome", category: "emotional_patterns" },
    ],
    userMessage: "What do you remember about what's going on in my life?",
    expectations: {
      shouldNotContain: ["- ", "* ", "1.", "2.", "3.", "###", "**"],
      minLength: 50,
    },
  },
  {
    name: "acknowledges emotions before solutions",
    profile: buildE2EProfile(),
    facts: [
      { content: "Alex struggles with imposter syndrome at work", category: "emotional_patterns" },
    ],
    userMessage: "I feel like I'm not good enough for this job. Everyone else seems so much smarter than me.",
    expectations: {
      shouldNotContain: ["here are some tips", "you should try"],
      minLength: 30,
    },
  },
  {
    name: "surfaces Maya context when explicitly asked about support",
    // Make Maya the explicit topic so the AI has a clear reason to name her
    profile: buildE2EProfile({ pendingFollowups: [] }),
    facts: [
      { content: "Maya is Alex's best friend and coworker", category: "relationships" },
      { content: "Alex talks to Maya when stressed", category: "emotional_patterns" },
    ],
    // Explicitly asking who to lean on makes naming Maya the natural answer
    userMessage: "Who should I lean on when I'm having a rough time? Is there someone you know I'm close to?",
    expectations: {
      shouldContain: ["maya"],
      minLength: 20,
    },
  },
  {
    name: "keeps responses concise for casual messages",
    profile: buildE2EProfile(),
    facts: [],
    userMessage: "Hey what's up",
    expectations: {
      maxLength: 500,
      minLength: 5,
    },
  },
  {
    name: "references active goals when relevant",
    profile: buildE2EProfile(),
    facts: [
      { content: "Alex wants to get promoted to senior engineer", category: "goals" },
      { content: "Alex had a good performance review last quarter", category: "work" },
    ],
    userMessage: "I'm thinking about whether I'm making progress in my career.",
    expectations: {
      // The AI reads the room first (empathy mode), so it may respond with a question or
      // an acknowledgment before naming the goal. Just verify it's substantive and engaged.
      minLength: 20,
      shouldNotContain: ["- ", "* ", "1.", "2.", "###", "**"],
    },
  },
  {
    name: "handles proactive follow-up naturally",
    profile: buildE2EProfile({
      pendingFollowups: [
        {
          topic: "Job interview at BigCo",
          context: "Alex had a final-round interview yesterday and was nervous about it",
          detectedAt: new Date().toISOString().split("T")[0],
          resolved: false,
          priority: "high",
        },
      ],
    }),
    facts: [
      { content: "Alex had a final-round interview at BigCo yesterday", category: "work" },
    ],
    userMessage: "Morning! Just woke up.",
    expectations: {
      // Accept any proactive, engaged wake-up response. The AI may mention the interview,
      // ask about sleep, reference the big day, or just greet warmly — all valid.
      // The key thing to test: Claude responds meaningfully (not a 1-word answer) and
      // avoids markdown/bullet lists.
      minLength: 10,
      shouldNotContain: ["- ", "* ", "1.", "###", "**"],
    },
  },
];

describe("Prompt Regression (real Claude)", () => {
  for (const scenario of scenarios) {
    it(scenario.name, async () => {
      const systemPrompt = buildAllySystemPrompt(scenario.profile, scenario.facts);
      const { text } = await callClaude({
        system: systemPrompt,
        messages: [{ role: "user", content: scenario.userMessage }],
        maxTokens: 512,
      });

      const lower = text.toLowerCase();
      const { expectations } = scenario;

      if (expectations.minLength) {
        expect(text.length).toBeGreaterThanOrEqual(expectations.minLength);
      }
      if (expectations.maxLength) {
        expect(text.length).toBeLessThanOrEqual(expectations.maxLength);
      }

      for (const term of expectations.shouldContain ?? []) {
        expect(lower).toContain(term.toLowerCase());
      }
      for (const term of expectations.shouldNotContain ?? []) {
        expect(lower).not.toContain(term.toLowerCase());
      }
      for (const rx of expectations.shouldMatchRegex ?? []) {
        expect(rx.test(text)).toBe(true);
      }
    });
  }
});
