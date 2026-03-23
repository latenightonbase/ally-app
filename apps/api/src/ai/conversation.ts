import {
  callClaudeWithTools,
  callClaudeStreamingWithTools,
  estimateTokens,
  estimateMessageTokens,
  MAX_CONTEXT_TOKENS,
  type ModelTier,
} from "./client";
import { buildAllySystemPrompt } from "./prompts";
import {
  getWebSearchTool,
  getCustomTools,
  executeToolCall,
  type ToolContext,
} from "./tools";
import type { MemoryProfile, MemoryFact, Message } from "@ally/shared";
import type Anthropic from "@anthropic-ai/sdk";

interface ConversationInput {
  message: string;
  profile: MemoryProfile | null;
  relevantFacts: Pick<MemoryFact, "content" | "category">[];
  conversationHistory: Pick<Message, "role" | "content">[];
  sessionSummaries?: string;
  sessionCount?: number;
  toolContext?: ToolContext;
  modelTier?: ModelTier;
}

function buildMessages(input: ConversationInput): Anthropic.MessageParam[] {
  const allMessages = [
    ...input.conversationHistory.map((m) => ({
      role: m.role === "ally" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user" as const, content: input.message },
  ];

  // Estimate system prompt tokens for budget calculation
  const systemText = buildAllySystemPrompt(
    input.profile,
    input.relevantFacts,
    input.sessionSummaries,
    input.sessionCount ?? 0,
  );
  const systemTokens = estimateTokens(systemText);
  const outputBudget = 400; // reserved for response
  const availableForHistory = MAX_CONTEXT_TOKENS - systemTokens - outputBudget;

  // Trim oldest messages if over budget (always keep latest user message)
  let messages = allMessages;
  while (messages.length > 1 && estimateMessageTokens(messages) > availableForHistory) {
    messages = messages.slice(1);
  }

  return messages;
}

function buildTools(input: ConversationInput): Anthropic.Messages.Tool[] {
  const tools: Anthropic.Messages.Tool[] = [...getCustomTools()];

  if (input.toolContext) {
    tools.push(getWebSearchTool(input.toolContext));
  }

  return tools;
}

function classifyMessageComplexity(message: string, sessionCount: number = 0): ModelTier {
  const emotionalPatterns = [
    /\b(feel|feeling|felt|sad|happy|angry|anxious|depressed|stressed|overwhelmed|lonely|scared|worried|hurt|frustrated|confused|lost|stuck)\b/i,
    /\b(advice|help me|what should i|how do i deal|cope|struggling|breaking down)\b/i,
    /\b(relationship|breakup|divorce|death|loss|grief|trauma)\b/i,
  ];

  // Deep relationships require nuanced reasoning — always use quality model
  if (sessionCount >= 20) return "quality";

  if (message.length > 200 || emotionalPatterns.some((p) => p.test(message))) {
    return "quality";
  }
  return "fast";
}

/** Rough token estimate: ~4 characters per token (conservative for English text). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const MAX_TOTAL_TOKENS = 150_000;

/**
 * Hard safety check: ensures system prompt + memory profile + conversation
 * history never exceeds MAX_TOTAL_TOKENS. If it does:
 *   1. Reduce conversation history to last 10 messages
 *   2. If still too large, trim profile to critical fields only
 */
function enforceTokenBudget(input: ConversationInput): ConversationInput {
  const systemText = buildAllySystemPrompt(
    input.profile,
    input.relevantFacts,
    input.sessionSummaries,
    input.sessionCount ?? 0,
  );

  const historyText = input.conversationHistory
    .map((m) => m.content)
    .join("\n");
  const messageTokens = estimateTokens(input.message);

  let totalTokens =
    estimateTokens(systemText) + estimateTokens(historyText) + messageTokens;

  if (totalTokens <= MAX_TOTAL_TOKENS) return input;

  // Step 1: trim history to last 10 messages
  let trimmedInput: ConversationInput = {
    ...input,
    conversationHistory: input.conversationHistory.slice(-10),
  };

  const trimmedHistoryText = trimmedInput.conversationHistory
    .map((m) => m.content)
    .join("\n");
  totalTokens =
    estimateTokens(systemText) +
    estimateTokens(trimmedHistoryText) +
    messageTokens;

  if (totalTokens <= MAX_TOTAL_TOKENS) {
    console.log(
      `[token-budget] Trimmed history from ${input.conversationHistory.length} to 10 messages (estimated ${totalTokens} tokens)`,
    );
    return trimmedInput;
  }

  // Step 2: trim profile to critical fields only
  const criticalProfile: ConversationInput["profile"] = input.profile
    ? {
        ...input.profile,
        personalInfo: {
          preferredName: input.profile.personalInfo?.preferredName ?? null,
          fullName: null,
          age: null,
          birthday: null,
          location: null,
          livingSituation: null,
          other: {},
        },
        relationships: input.profile.relationships?.slice(0, 5) ?? [],
        work: {
          role: null,
          company: null,
          companyType: null,
          currentProjects: [],
          currentGoals: [],
          stressors: [],
          colleagues: [],
        },
        health: {
          fitnessGoals: [],
          currentRoutine: null,
          sleepNotes: null,
          dietNotes: null,
          mentalHealthNotes: null,
          other: {},
        },
        interests: [],
        goals: [],
        emotionalPatterns: input.profile.emotionalPatterns ?? {
          primaryStressors: [],
          copingMechanisms: [],
          moodTrends: [],
          recurringThemes: [],
          sensitivities: [],
        },
        pendingFollowups: input.profile.pendingFollowups?.filter(
          (f) => !f.resolved,
        ) ?? [],
        dynamicAttributes: undefined,
      }
    : null;

  trimmedInput = {
    ...trimmedInput,
    profile: criticalProfile,
    relevantFacts: [],
    sessionSummaries: undefined,
  };

  const reducedSystemText = buildAllySystemPrompt(
    criticalProfile,
    [],
    undefined,
    input.sessionCount ?? 0,
  );
  totalTokens =
    estimateTokens(reducedSystemText) +
    estimateTokens(trimmedHistoryText) +
    messageTokens;

  console.log(
    `[token-budget] Trimmed profile to critical fields + history to 10 messages (estimated ${totalTokens} tokens)`,
  );

  return trimmedInput;
}

function buildCachedSystemPrompt(input: ConversationInput): Anthropic.Messages.TextBlockParam[] {
  const systemText = buildAllySystemPrompt(
    input.profile,
    input.relevantFacts,
    input.sessionSummaries,
    input.sessionCount ?? 0,
  );
  return [
    {
      type: "text" as const,
      text: systemText,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

export async function generateReply(input: ConversationInput): Promise<{
  response: string;
  tokensUsed: number;
}> {
  const safeInput = enforceTokenBudget(input);
  const system = buildCachedSystemPrompt(safeInput);
  const messages = buildMessages(safeInput);
  const tools = buildTools(safeInput);
  const modelTier = safeInput.modelTier ?? classifyMessageComplexity(safeInput.message, safeInput.sessionCount ?? 0);

  const result = await callClaudeWithTools({
    system,
    messages,
    tools,
    maxTokens: 400,
    modelTier,
    onToolCall: safeInput.toolContext
      ? (name, toolInput) => executeToolCall(name, toolInput, safeInput.toolContext!)
      : undefined,
  });

  return { response: result.text, tokensUsed: result.tokensUsed };
}

export async function generateReplyStreaming(
  input: ConversationInput,
  onToken: (token: string) => void,
): Promise<{ response: string; tokensUsed: number }> {
  const safeInput = enforceTokenBudget(input);
  const system = buildCachedSystemPrompt(safeInput);
  const messages = buildMessages(safeInput);
  const tools = buildTools(safeInput);
  const modelTier = safeInput.modelTier ?? classifyMessageComplexity(safeInput.message, safeInput.sessionCount ?? 0);

  const result = await callClaudeStreamingWithTools({
    system,
    messages,
    tools,
    maxTokens: 400,
    modelTier,
    onToken,
    onToolCall: safeInput.toolContext
      ? (name, toolInput) => executeToolCall(name, toolInput, safeInput.toolContext!)
      : undefined,
  });

  return { response: result.fullText, tokensUsed: result.tokensUsed };
}
