import { AIError } from "../ai/client";
import type { MemoryCategory } from "@ally/shared";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-4-lite";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

const CATEGORY_CONTEXT: Record<MemoryCategory, string> = {
  personal_info: "User's personal information",
  relationships: "User's relationships and people in their life",
  work: "User's work, career, and professional life",
  health: "User's health, fitness, and wellness",
  interests: "User's interests, hobbies, and preferences",
  goals: "User's goals, plans, and aspirations",
  emotional_patterns: "User's emotional patterns and mental state",
};

async function callVoyage(
  input: string[],
  inputType?: "query" | "document",
  attempt = 0,
): Promise<number[][]> {
  try {
    const body: Record<string, unknown> = { input, model: VOYAGE_MODEL };
    if (inputType) body.input_type = inputType;

    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      return callVoyage(input, inputType, attempt + 1);
    }

    if (!response.ok) {
      const respBody = await response.text().catch(() => "unknown");
      throw new AIError(
        `Voyage AI embedding failed (${response.status}): ${respBody}`,
        503,
        response.status >= 500 || response.status === 429,
      );
    }

    const result = (await response.json()) as {
      data: { embedding: number[] }[];
    };
    return result.data.map((d) => d.embedding);
  } catch (e) {
    if (e instanceof AIError) throw e;

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      return callVoyage(input, inputType, attempt + 1);
    }
    throw new AIError("Voyage AI unavailable", 503, true);
  }
}

/**
 * Add contextual prefix to improve embedding quality.
 * Per Anthropic's contextual retrieval research, this improves
 * retrieval accuracy by 20-67%.
 */
export function addContextualPrefix(text: string, category?: MemoryCategory): string {
  const prefix = category ? CATEGORY_CONTEXT[category] : "User memory";
  return `${prefix}: ${text}`;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const results = await callVoyage([text], "query");
  return results[0];
}

export async function generateEmbeddings(
  texts: string[],
  inputType: "query" | "document" = "document",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batchSize = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await callVoyage(batch, inputType);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

export async function isVoyageReachable(): Promise<boolean> {
  try {
    await callVoyage(["health check"]);
    return true;
  } catch {
    return false;
  }
}
