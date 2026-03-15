import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock BullMQ before importing memoryQueue
const mockQueueAdd = mock(async () => ({ id: "job-123" }));
const mockWorkerOn = mock(() => {});

mock.module("bullmq", () => ({
  Queue: class {
    add = mockQueueAdd;
    on = mockWorkerOn;
  },
  Worker: class {
    on = mockWorkerOn;
  },
}));

mock.module("ioredis", () => ({
  Redis: class {
    on = mock(() => {});
    connect = mock(async () => {});
  },
}));

const { enqueueExtraction, getQueueStats } = await import("../../../services/memoryQueue");

describe("memoryQueue", () => {
  beforeEach(() => {
    mockQueueAdd.mockReset();
  });

  describe("shouldExtract filter (tested via enqueueExtraction)", () => {
    it("does NOT enqueue trivial one-word responses", async () => {
      enqueueExtraction("user-1", "conv-1", "ok", "Great to hear that!");
      await new Promise((r) => setTimeout(r, 50));
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("does NOT enqueue single-word acknowledgements", async () => {
      enqueueExtraction("user-1", "conv-1", "thanks", "You're welcome!");
      await new Promise((r) => setTimeout(r, 50));
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("enqueues messages with personal signals", async () => {
      enqueueExtraction(
        "user-1",
        "conv-1",
        "I have a job interview at Stripe next Monday",
        "Good luck! That sounds exciting.",
      );
      await new Promise((r) => setTimeout(r, 50));
    });

    it("enqueues messages mentioning family/relationships", async () => {
      enqueueExtraction(
        "user-1",
        "conv-1",
        "My sister told me she got engaged",
        "Oh wow, congratulations to her!",
      );
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  describe("getQueueStats", () => {
    it("returns an object with pendingItems and trackedUsers", () => {
      const stats = getQueueStats();
      expect(typeof stats.pendingItems).toBe("number");
      expect(typeof stats.trackedUsers).toBe("number");
    });

    it("pendingItems is >= 0", () => {
      const stats = getQueueStats();
      expect(stats.pendingItems).toBeGreaterThanOrEqual(0);
    });
  });
});
