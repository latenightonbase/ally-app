import { describe, it, expect } from "bun:test";

describe("consolidation job (unit)", () => {
  it("exports runConsolidation function", async () => {
    const mod = await import("../../../jobs/consolidation");
    expect(typeof mod.runConsolidation).toBe("function");
  });
});
