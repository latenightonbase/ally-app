import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = "claude-haiku-4-5-20251001" as const;

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

export async function callClaude(options: {
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
}): Promise<{ text: string; tokensUsed: number }> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: options.maxTokens ?? 1024,
      system: options.system,
      messages: options.messages,
    });

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

export async function callClaudeStreaming(options: {
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  onToken: (token: string) => void;
}): Promise<{ fullText: string; tokensUsed: number }> {
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: options.maxTokens ?? 1024,
      system: options.system,
      messages: options.messages,
    });

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
}): Promise<{ data: T; tokensUsed: number }> {
  const result = await callClaude(options);

  try {
    const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : result.text;
    console.log(`[callClaudeStructured] Raw response (first 500 chars): ${result.text.slice(0, 500)}`);
    return {
      data: JSON.parse(jsonStr.trim()) as T,
      tokensUsed: result.tokensUsed,
    };
  } catch (parseErr) {
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
      model: MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return true;
  } catch {
    return false;
  }
}
