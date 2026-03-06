import { describe, it, expect } from "bun:test";
import { generateEmbedding, generateEmbeddings } from "../../../services/embedding";

describe("Embedding Service (mocked)", () => {
  it("generateEmbedding returns a 1024-dimensional vector", async () => {
    const embedding = await generateEmbedding("test text");
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(1024);
  });

  it("generateEmbeddings returns vectors for each input", async () => {
    const embeddings = await generateEmbeddings(["text 1", "text 2", "text 3"]);
    expect(embeddings.length).toBe(3);
    for (const emb of embeddings) {
      expect(emb.length).toBe(1024);
    }
  });

  it("generateEmbeddings handles empty input", async () => {
    const embeddings = await generateEmbeddings([]);
    expect(embeddings).toEqual([]);
  });
});
