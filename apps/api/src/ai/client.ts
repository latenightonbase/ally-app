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
 * Rough token estimate: ~4 chars per token for English text.
 * Used as a pre-flight guard to prevent exceeding context limits.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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

/** Hard ceiling for total input tokens (leaves room for output). */
export const MAX_CONTEXT_TOKENS = 160_000;

export async function callClaude(options: {
  system: string | Anthropic.Messages.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  tools?: Anthropic.Messages.Tool[];
  modelTier?: ModelTier;
}): Promise<{ text: string; tokensUsed: number }> {
  try {
    const response = await anthropic.messages.create({
      model: selectModel(options.modelTier),
      max_tokens: options.maxTokens ?? 1024,
      system: options.system,
      messages: options.messages,
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
  let messages = [...options.messages];
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
  let messages = [...options.messages];
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
  try {
    const stream = anthropic.messages.stream({
      model: selectModel(options.modelTier),
      max_tokens: options.maxTokens ?? 1024,
      system: options.system,
      messages: options.messages,
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
