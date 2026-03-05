import { AIError } from "../ai/client";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-lite";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

async function callVoyage(
  input: string[],
  attempt = 0,
): Promise<number[][]> {
  try {
    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input, model: VOYAGE_MODEL }),
    });

    if (response.status === 429 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      return callVoyage(input, attempt + 1);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "unknown");
      throw new AIError(
        `Voyage AI embedding failed (${response.status}): ${body}`,
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
      return callVoyage(input, attempt + 1);
    }
    throw new AIError("Voyage AI unavailable", 503, true);
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const results = await callVoyage([text]);
  return results[0];
}

export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batchSize = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await callVoyage(batch);
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
