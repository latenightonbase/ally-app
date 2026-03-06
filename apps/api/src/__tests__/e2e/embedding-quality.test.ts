import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { generateEmbedding, generateEmbeddings } from "../../services/embedding";
import { cosineSimilarity, e2eCleanup } from "./helpers";

describe("Embedding Quality (live Voyage AI)", () => {
  afterAll(async () => {
    await e2eCleanup();
  });

  it("returns a 1024-dimensional non-zero vector", async () => {
    const embedding = await generateEmbedding("I enjoy programming in TypeScript");
    expect(embedding.length).toBe(1024);

    const nonZeroCount = embedding.filter((v) => v !== 0).length;
    expect(nonZeroCount).toBeGreaterThan(900);
  });

  it("semantically similar texts have higher cosine similarity than dissimilar ones", async () => {
    const [embA, embB, embC] = await generateEmbeddings([
      "I love coding and building software",
      "Programming and software development are my passion",
      "The weather in Hawaii is beautiful this time of year",
    ]);

    const simAB = cosineSimilarity(embA, embB);
    const simAC = cosineSimilarity(embA, embC);
    const simBC = cosineSimilarity(embB, embC);

    expect(simAB).toBeGreaterThan(0.6);
    expect(simAB).toBeGreaterThan(simAC);
    expect(simAB).toBeGreaterThan(simBC);
  });

  it("produces deterministic embeddings for the same input", async () => {
    const text = "Ally is a personal AI companion";
    const [emb1, emb2] = await generateEmbeddings([text, text]);

    const sim = cosineSimilarity(emb1, emb2);
    expect(sim).toBeGreaterThan(0.999);
  });

  it("handles batch embedding correctly", async () => {
    const texts = [
      "My best friend Maya is always there for me",
      "I have a presentation at work on Monday",
      "Running helps me manage stress",
      "I struggle with imposter syndrome",
      "Cooking dinner at home saves money",
    ];

    const embeddings = await generateEmbeddings(texts);
    expect(embeddings.length).toBe(texts.length);

    for (const emb of embeddings) {
      expect(emb.length).toBe(1024);
      expect(emb.some((v) => v !== 0)).toBe(true);
    }
  });

  it("distinguishes between emotional and factual content", async () => {
    const [emotional, factual, emotionalQuery] = await generateEmbeddings([
      "I'm really anxious about my upcoming presentation and feel like I'm going to fail",
      "The presentation is scheduled for Monday at 2pm in conference room B",
      "I feel nervous and scared about presenting",
    ]);

    const simEmotional = cosineSimilarity(emotional, emotionalQuery);
    const simFactual = cosineSimilarity(factual, emotionalQuery);

    expect(simEmotional).toBeGreaterThan(simFactual);
  });
});
