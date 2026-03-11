import {
  callClaudeWithTools,
  callClaudeStreamingWithTools,
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
  toolContext?: ToolContext;
  modelTier?: ModelTier;
}

function buildMessages(input: ConversationInput): Anthropic.MessageParam[] {
  return [
    ...input.conversationHistory.map((m) => ({
      role: m.role === "ally" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user" as const, content: input.message },
  ];
}

function buildTools(input: ConversationInput): Anthropic.Messages.Tool[] {
  const tools: Anthropic.Messages.Tool[] = [...getCustomTools()];

  if (input.toolContext) {
    tools.push(getWebSearchTool(input.toolContext));
  }

  return tools;
}

function classifyMessageComplexity(message: string): ModelTier {
  const emotionalPatterns = [
    /\b(feel|feeling|felt|sad|happy|angry|anxious|depressed|stressed|overwhelmed|lonely|scared|worried|hurt|frustrated|confused|lost|stuck)\b/i,
    /\b(advice|help me|what should i|how do i deal|cope|struggling|breaking down)\b/i,
    /\b(relationship|breakup|divorce|death|loss|grief|trauma)\b/i,
  ];

  if (message.length > 200 || emotionalPatterns.some((p) => p.test(message))) {
    return "quality";
  }
  return "fast";
}

function buildCachedSystemPrompt(input: ConversationInput): Anthropic.Messages.TextBlockParam[] {
  const systemText = buildAllySystemPrompt(input.profile, input.relevantFacts, input.sessionSummaries);
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
  const system = buildCachedSystemPrompt(input);
  const messages = buildMessages(input);
  const tools = buildTools(input);
  const modelTier = input.modelTier ?? classifyMessageComplexity(input.message);

  const result = await callClaudeWithTools({
    system,
    messages,
    tools,
    maxTokens: 512,
    modelTier,
    onToolCall: input.toolContext
      ? (name, toolInput) => executeToolCall(name, toolInput, input.toolContext!)
      : undefined,
  });

  return { response: result.text, tokensUsed: result.tokensUsed };
}

export async function generateReplyStreaming(
  input: ConversationInput,
  onToken: (token: string) => void,
): Promise<{ response: string; tokensUsed: number }> {
  const system = buildCachedSystemPrompt(input);
  const messages = buildMessages(input);
  const tools = buildTools(input);
  const modelTier = input.modelTier ?? classifyMessageComplexity(input.message);

  const result = await callClaudeStreamingWithTools({
    system,
    messages,
    tools,
    maxTokens: 512,
    modelTier,
    onToken,
    onToolCall: input.toolContext
      ? (name, toolInput) => executeToolCall(name, toolInput, input.toolContext!)
      : undefined,
  });

  return { response: result.fullText, tokensUsed: result.tokensUsed };
}
