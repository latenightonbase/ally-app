import { describe, it, expect, beforeEach } from "bun:test";
import { db, schema } from "../../../db";
import { eq, and, gte } from "drizzle-orm";
import { truncateAll } from "../../helpers/seed";

describe("Scheduler Persistence", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("records a job run in the database", async () => {
    const [run] = await db
      .insert(schema.jobRuns)
      .values({ jobName: "test_job", status: "running" })
      .returning();

    expect(run.id).toBeDefined();
    expect(run.status).toBe("running");
    expect(run.startedAt).toBeDefined();
  });

  it("can mark a job as completed", async () => {
    const [run] = await db
      .insert(schema.jobRuns)
      .values({ jobName: "test_job", status: "running" })
      .returning();

    await db
      .update(schema.jobRuns)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(schema.jobRuns.id, run.id));

    const updated = await db.query.jobRuns.findFirst({
      where: eq(schema.jobRuns.id, run.id),
    });
    expect(updated?.status).toBe("completed");
    expect(updated?.completedAt).toBeDefined();
  });

  it("can mark a job as failed with metadata", async () => {
    const [run] = await db
      .insert(schema.jobRuns)
      .values({ jobName: "test_job", status: "running" })
      .returning();

    await db
      .update(schema.jobRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        metadata: { error: "Something went wrong" },
      })
      .where(eq(schema.jobRuns.id, run.id));

    const updated = await db.query.jobRuns.findFirst({
      where: eq(schema.jobRuns.id, run.id),
    });
    expect(updated?.status).toBe("failed");
    expect((updated?.metadata as any)?.error).toBe("Something went wrong");
  });

  it("hasRunToday logic works correctly", async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const beforeInsert = await db.query.jobRuns.findFirst({
      where: and(
        eq(schema.jobRuns.jobName, "daily_check"),
        gte(schema.jobRuns.startedAt, todayStart),
      ),
    });
    expect(beforeInsert).toBeUndefined();

    await db
      .insert(schema.jobRuns)
      .values({ jobName: "daily_check", status: "completed" });

    const afterInsert = await db.query.jobRuns.findFirst({
      where: and(
        eq(schema.jobRuns.jobName, "daily_check"),
        gte(schema.jobRuns.startedAt, todayStart),
      ),
    });
    expect(afterInsert).toBeDefined();
    expect(afterInsert?.jobName).toBe("daily_check");
  });

  it("distinguishes between different job names", async () => {
    await db.insert(schema.jobRuns).values([
      { jobName: "job_a", status: "completed" },
      { jobName: "job_b", status: "completed" },
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const jobA = await db.query.jobRuns.findFirst({
      where: and(
        eq(schema.jobRuns.jobName, "job_a"),
        gte(schema.jobRuns.startedAt, todayStart),
      ),
    });
    const jobC = await db.query.jobRuns.findFirst({
      where: and(
        eq(schema.jobRuns.jobName, "job_c"),
        gte(schema.jobRuns.startedAt, todayStart),
      ),
    });

    expect(jobA).toBeDefined();
    expect(jobC).toBeUndefined();
  });
});
