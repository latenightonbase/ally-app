import { retrieveRelevantFacts } from "../services/retrieval";
import { storeExtractedFacts, addFollowups } from "../services/memory";
import type { ExtractedFact, MemoryCategory } from "@ally/shared";
import type Anthropic from "@anthropic-ai/sdk";

export interface ToolContext {
  userId: string;
  conversationId: string;
  timezone?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
}

export function getWebSearchTool(ctx: ToolContext): Anthropic.Messages.Tool {
  const tool: Record<string, unknown> = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3,
  };

  if (ctx.location?.city || ctx.timezone) {
    tool.user_location = {
      type: "approximate",
      ...(ctx.location?.city && { city: ctx.location.city }),
      ...(ctx.location?.region && { region: ctx.location.region }),
      ...(ctx.location?.country && { country: ctx.location.country }),
      ...(ctx.timezone && { timezone: ctx.timezone }),
    };
  }

  return tool as unknown as Anthropic.Messages.Tool;
}

export function getCustomTools(): Anthropic.Messages.Tool[] {
  return [
    {
      name: "remember_fact",
      description:
        "Explicitly save an important fact about the user to long-term memory. Use this when the user shares something significant that should be remembered: life events, preferences, relationships, goals, health info, or emotional patterns. Do NOT use for trivial or transient information.",
      input_schema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "The fact to remember, stated clearly and concisely",
          },
          category: {
            type: "string",
            enum: [
              "personal_info",
              "relationships",
              "work",
              "health",
              "interests",
              "goals",
              "emotional_patterns",
            ],
            description: "The category this fact belongs to",
          },
          importance: {
            type: "number",
            description:
              "How important is this fact? 0.9+ for life events/health, 0.5-0.8 for preferences, 0.1-0.4 for casual mentions",
          },
        },
        required: ["content", "category", "importance"],
      },
    },
    {
      name: "recall_memory",
      description:
        "Search your memory for facts about the user. Use this when you need to recall specific details the user has shared before — names, events, preferences, goals, health info. The query should be specific to what you're trying to remember.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "What you want to recall, e.g. 'user's mother's name' or 'fitness goals'",
          },
          category: {
            type: "string",
            enum: [
              "personal_info",
              "relationships",
              "work",
              "health",
              "interests",
              "goals",
              "emotional_patterns",
            ],
            description: "Optional: filter by category to narrow results",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "set_reminder",
      description:
        "Set a reminder or follow-up for the user. Use this when the user mentions something upcoming they want to be reminded about, or when you detect an unresolved topic worth following up on.",
      input_schema: {
        type: "object" as const,
        properties: {
          topic: {
            type: "string",
            description: "What to follow up on",
          },
          context: {
            type: "string",
            description: "Why this needs following up and relevant background",
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "high: time-sensitive or emotional, medium: worth checking in, low: nice to remember",
          },
        },
        required: ["topic", "context", "priority"],
      },
    },
  ];
}

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  switch (toolName) {
    case "remember_fact":
      return handleRememberFact(toolInput, ctx);
    case "recall_memory":
      return handleRecallMemory(toolInput, ctx);
    case "set_reminder":
      return handleSetReminder(toolInput, ctx);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

async function handleRememberFact(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const fact: ExtractedFact = {
    content: input.content as string,
    category: input.category as MemoryCategory,
    importance: input.importance as number,
    confidence: 0.95,
    updateType: "new",
    entities: [],
    emotion: null,
    temporal: false,
    memoryType: "semantic",
    eventDate: null,
  };

  await storeExtractedFacts(ctx.userId, [fact], ctx.conversationId);
  return JSON.stringify({ saved: true, content: fact.content });
}

async function handleRecallMemory(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const query = input.query as string;
  const category = input.category as MemoryCategory | undefined;

  const facts = await retrieveRelevantFacts({
    userId: ctx.userId,
    query,
    limit: 5,
    categoryFilter: category,
  });

  if (facts.length === 0) {
    return JSON.stringify({ found: false, message: "No relevant memories found." });
  }

  return JSON.stringify({
    found: true,
    facts: facts.map((f) => ({
      content: f.content,
      category: f.category,
      relevance: Math.round(f.score * 100) / 100,
    })),
  });
}

async function handleSetReminder(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  await addFollowups(ctx.userId, [
    {
      topic: input.topic as string,
      context: input.context as string,
      priority: input.priority as "high" | "medium" | "low",
    },
  ]);

  return JSON.stringify({
    saved: true,
    topic: input.topic,
    priority: input.priority,
  });
}
