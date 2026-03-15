import { describe, it, expect } from "bun:test";

describe("memoryMaintenance job (unit)", () => {
  it("exports runMemoryMaintenance function", async () => {
    const mod = await import("../../../jobs/memoryMaintenance");
    expect(typeof mod.runMemoryMaintenance).toBe("function");
  });

  it("exports runDailyMaintenance function", async () => {
    const mod = await import("../../../jobs/memoryMaintenance");
    expect(typeof mod.runDailyMaintenance).toBe("function");
  });

  it("exports runMonthlyDecay function", async () => {
    const mod = await import("../../../jobs/memoryMaintenance");
    expect(typeof mod.runMonthlyDecay).toBe("function");
  });

  it("batchUpdateImportance mock is callable from the vectorStore mock", async () => {
    const { batchUpdateImportance } = await import("../../../services/vectorStore");
    await expect(
      batchUpdateImportance([{ factId: "fact-1", importance: 0.4 }]),
    ).resolves.toBeUndefined();
  });
});
