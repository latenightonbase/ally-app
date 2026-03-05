import { callClaude, callClaudeStreaming } from "./client";
import { buildAllySystemPrompt } from "./prompts";
import type { MemoryProfile, MemoryFact, Message } from "@ally/shared";

interface ConversationInput {
  message: string;
  profile: MemoryProfile | null;
  relevantFacts: Pick<MemoryFact, "content" | "category">[];
  conversationHistory: Pick<Message, "role" | "content">[];
}

function buildMessages(input: ConversationInput) {
  return [
    ...input.conversationHistory.map((m) => ({
      role: m.role === "ally" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user" as const, content: input.message },
  ];
}

export async function generateReply(input: ConversationInput): Promise<{
  response: string;
  tokensUsed: number;
}> {
  const systemPrompt = buildAllySystemPrompt(input.profile, input.relevantFacts);
  const messages = buildMessages(input);

  const result = await callClaude({
    system: systemPrompt,
    messages,
    maxTokens: 1024,
  });

  return { response: result.text, tokensUsed: result.tokensUsed };
}

export async function generateReplyStreaming(
  input: ConversationInput,
  onToken: (token: string) => void,
): Promise<{ response: string; tokensUsed: number }> {
  const systemPrompt = buildAllySystemPrompt(input.profile, input.relevantFacts);
  const messages = buildMessages(input);

  const result = await callClaudeStreaming({
    system: systemPrompt,
    messages,
    maxTokens: 1024,
    onToken,
  });

  return { response: result.fullText, tokensUsed: result.tokensUsed };
}
