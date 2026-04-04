import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL_FAST = "claude-haiku-4-5-20251001" as const;
export const MODEL_QUALITY = "claude-sonnet-4-6" as const;

export type ModelTier = "fast" | "quality";

export function selectModel(tier: ModelTier = "fast"): string {
  return tier === "quality" ? MODEL_QUALITY : MODEL_FAST;
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 503,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "AIError";
  }
}

/**
 * Conservative token estimate: ~3.2 chars per token for English text.
 * Using 3.2 instead of 4 prevents undercounting that caused 200K overflows.
 * Used as a pre-flight guard to prevent exceeding context limits.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.2);
}

/**
 * Estimate total tokens for an array of messages.
 */
export function estimateMessageTokens(
  messages: Anthropic.MessageParam[],
): number {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      total += estimateTokens(m.content);
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if ("text" in block && typeof block.text === "string") {
          total += estimateTokens(block.text);
        }
      }
    }
  }
  return total;
}

/** Hard ceiling for total input tokens (leaves room for output against 200K limit). */
export const MAX_CONTEXT_TOKENS = 140_000;

/**
 * Truncate a string to approximately fit within a token budget.
 * Cuts at the last newline within the budget to avoid mid-line breaks.
 */
function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const charLimit = Math.floor(maxTokens * 3.2);
  const cut = text.slice(0, charLimit);
  const lastNl = cut.lastIndexOf("\n");
  return (lastNl > charLimit * 0.5 ? cut.slice(0, lastNl) : cut) + "\n…[truncated to fit context window]";
}

/**
 * Pre-flight guard: ensure messages fit within the available token budget.
 * Multi-turn: drops oldest messages first (keeps the last 2).
 * Single / last message: truncates content string.
 */
function fitMessagesToBudget(
  messages: Anthropic.MessageParam[],
  tokenBudget: number,
): Anthropic.MessageParam[] {
  if (tokenBudget <= 0) return messages;
  let est = estimateMessageTokens(messages);
  if (est <= tokenBudget) return messages;

  // Strategy 1: drop oldest turns, keeping at least 2
  let trimmed = [...messages];
  while (trimmed.length > 2 && estimateMessageTokens(trimmed) > tokenBudget) {
    trimmed = trimmed.slice(1);
  }
  est = estimateMessageTokens(trimmed);
  if (est <= tokenBudget) return trimmed;

  // Strategy 2: truncate the last message's content
  const last = trimmed[trimmed.length - 1];
  if (typeof last.content === "string") {
    const preceding = trimmed.slice(0, -1);
    const remaining = tokenBudget - estimateMessageTokens(preceding);
    return [
      ...preceding,
      { ...last, content: truncateToTokenBudget(last.content, Math.max(remaining, 500)) },
    ];
  }

  return trimmed;
}

/** Compute the token budget available for messages given system + output reservation. */
function computeMessageBudget(
  system: string | Anthropic.Messages.TextBlockParam[],
  maxOutputTokens: number,
): number {
  const systemStr = typeof system === "string"
    ? system
    : system.map((b) => b.text).join("\n");
  return MAX_CONTEXT_TOKENS - estimateTokens(systemStr) - maxOutputTokens;
}

export async function callClaude(options: {
  system: string | Anthropic.Messages.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  tools?: Anthropic.Messages.Tool[];
  modelTier?: ModelTier;
}): Promise<{ text: string; tokensUsed: number }> {
  // Pre-flight token guard
  const msgBudget = computeMessageBudget(options.system, options.maxTokens ?? 1024);
  const safeMessages = fitMessagesToBudget(options.messages, msgBudget);

  try {
    const response = await anthropic.messages.create({
      model: selectModel(options.modelTier),
      max_tokens: options.maxTokens ?? 1024,
      system: options.system,
      messages: safeMessages,
      ...(options.tools?.length && { tools: options.tools }),
    } as Anthropic.Messages.MessageCreateParamsNonStreaming);

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      tokensUsed:
        (response.usage.input_tokens ?? 0) +
        (response.usage.output_tokens ?? 0),
    };
  } catch (e: unknown) {
    if (e instanceof Anthropic.APIError) {
      const retryable = e.status === 429 || e.status >= 500;
      throw new AIError(
        `Claude API error: ${e.message}`,
        e.status === 429 ? 429 : 503,
        retryable,
      );
    }
    throw new AIError("Claude API unavailable", 503, true);
  }
}

export async function callClaudeWithTools(options: {
  system: string | Anthropic.Messages.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Messages.Tool[];
  maxTokens?: number;
  modelTier?: ModelTier;
  onToolCall?: (name: string, input: Record<string, unknown>) => Promise<string>;
}): Promise<{ text: string; tokensUsed: number }> {
  const msgBudget = computeMessageBudget(options.system, options.maxTokens ?? 1024);
  let messages = fitMessagesToBudget([...options.messages], msgBudget);
  let totalTokens = 0;
  const maxLoops = 3;

  for (let i = 0; i < maxLoops; i++) {
    try {
      const response = await anthropic.messages.create({
        model: selectModel(options.modelTier),
        max_tokens: options.maxTokens ?? 1024,
        system: options.system,
        messages,
        tools: options.tools,
      } as Anthropic.Messages.MessageCreateParamsNonStreaming);

      totalTokens += (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);

      if (response.stop_reason === "tool_use" && options.onToolCall) {
        messages = [...messages, { role: "assistant", content: response.content }];

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            const result = await options.onToolCall(block.name, block.input as Record<string, unknown>);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        messages = [...messages, { role: "user", content: toolResults }];
        continue;
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      return { text, tokensUsed: totalTokens };
    } catch (e: unknown) {
      if (e instanceof Anthropic.APIError) {
        const retryable = e.status === 429 || e.status >= 500;
        throw new AIError(
          `Claude API error: ${e.message}`,
          e.status === 429 ? 429 : 503,
          retryable,
        );
      }
      throw new AIError("Claude API unavailable", 503, true);
    }
  }

  throw new AIError("Tool call loop exceeded maximum iterations", 500, false);
}

export async function callClaudeStreamingWithTools(options: {
  system: string | Anthropic.Messages.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Messages.Tool[];
  maxTokens?: number;
  modelTier?: ModelTier;
  onToken: (token: string) => void;
  onToolCall?: (name: string, input: Record<string, unknown>) => Promise<string>;
}): Promise<{ fullText: string; tokensUsed: number }> {
  const msgBudget = computeMessageBudget(options.system, options.maxTokens ?? 1024);
  let messages = fitMessagesToBudget([...options.messages], msgBudget);
  let totalTokens = 0;
  let fullText = "";
  const maxLoops = 3;

  for (let i = 0; i < maxLoops; i++) {
    try {
      const stream = anthropic.messages.stream({
        model: selectModel(options.modelTier),
        max_tokens: options.maxTokens ?? 1024,
        system: options.system,
        messages,
        tools: options.tools,
      } as Anthropic.Messages.MessageStreamParams);

      stream.on("text", (text) => {
        fullText += text;
        options.onToken(text);
      });

      const finalMessage = await stream.finalMessage();
      totalTokens += (finalMessage.usage.input_tokens ?? 0) + (finalMessage.usage.output_tokens ?? 0);

      if (finalMessage.stop_reason === "tool_use" && options.onToolCall) {
        messages = [...messages, { role: "assistant", content: finalMessage.content }];

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const block of finalMessage.content) {
          if (block.type === "tool_use") {
            const result = await options.onToolCall(block.name, block.input as Record<string, unknown>);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        messages = [...messages, { role: "user", content: toolResults }];
        continue;
      }

      return { fullText, tokensUsed: totalTokens };
    } catch (e: unknown) {
      if (e instanceof Anthropic.APIError) {
        throw new AIError(
          `Claude streaming error: ${e.message}`,
          e.status === 429 ? 429 : 503,
          true,
        );
      }
      throw new AIError("Claude API unavailable", 503, true);
    }
  }

  throw new AIError("Streaming tool call loop exceeded maximum iterations", 500, false);
}

export async function callClaudeStreaming(options: {
  system: string | Anthropic.Messages.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  onToken: (token: string) => void;
  modelTier?: ModelTier;
}): Promise<{ fullText: string; tokensUsed: number }> {
  const msgBudget = computeMessageBudget(options.system, options.maxTokens ?? 1024);
  const safeMessages = fitMessagesToBudget(options.messages, msgBudget);

  try {
    const stream = anthropic.messages.stream({
      model: selectModel(options.modelTier),
      max_tokens: options.maxTokens ?? 1024,
      system: options.system,
      messages: safeMessages,
    } as Anthropic.Messages.MessageStreamParams);

    let fullText = "";

    stream.on("text", (text) => {
      fullText += text;
      options.onToken(text);
    });

    const finalMessage = await stream.finalMessage();

    return {
      fullText,
      tokensUsed:
        (finalMessage.usage.input_tokens ?? 0) +
        (finalMessage.usage.output_tokens ?? 0),
    };
  } catch (e: unknown) {
    if (e instanceof Anthropic.APIError) {
      throw new AIError(
        `Claude streaming error: ${e.message}`,
        e.status === 429 ? 429 : 503,
        true,
      );
    }
    throw new AIError("Claude API unavailable", 503, true);
  }
}

export async function callClaudeStructured<T>(options: {
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  modelTier?: ModelTier;
}): Promise<{ data: T; tokensUsed: number }> {
  const result = await callClaude(options);

  try {
    const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : result.text;
    return {
      data: JSON.parse(jsonStr.trim()) as T,
      tokensUsed: result.tokensUsed,
    };
  } catch {
    console.error(
      `[callClaudeStructured] JSON parse failed. Raw response:\n${result.text}`,
    );
    throw new AIError(
      "Failed to parse structured AI response",
      500,
      false,
    );
  }
}

export async function isClaudeReachable(): Promise<boolean> {
  try {
    await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return true;
  } catch {
    return false;
  }
}
