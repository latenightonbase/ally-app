import { db, schema } from "../db";
import { eq, and, gte, sql } from "drizzle-orm";
import { runNightlyExtraction } from "./nightlyExtraction";
import { runDailyBriefings } from "./dailyBriefings";
import { runWeeklyInsights } from "./weeklyInsights";
import { runReengagement } from "./reengagement";
import { runDailyPing } from "./dailyPing";

interface ScheduledJob {
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
  enabled: boolean;
  skipDedup?: boolean;
}

const jobs: ScheduledJob[] = [
  {
    name: "nightly_extraction",
    cronExpression: "0 23 * * *",
    handler: runNightlyExtraction,
    enabled: true,
  },
  {
    name: "daily_briefings",
    cronExpression: "0 5 * * *",
    handler: runDailyBriefings,
    enabled: true,
  },
  {
    name: "weekly_insights",
    cronExpression: "0 20 * * 0",
    handler: runWeeklyInsights,
    enabled: true,
  },
  {
    name: "reengagement",
    cronExpression: "0 18 * * *",
    handler: runReengagement,
    enabled: true,
  },
  {
    name: "daily_ping",
    cronExpression: "* * * * *",
    handler: runDailyPing,
    enabled: true,
    skipDedup: true,
  },
];

function parseCron(expression: string): {
  hour: number;
  minute: number;
  dayOfWeek?: number;
} {
  const [minute, hour, , , dayOfWeek] = expression.split(" ");
  return {
    minute: Number(minute),
    hour: Number(hour),
    dayOfWeek: dayOfWeek !== "*" ? Number(dayOfWeek) : undefined,
  };
}

async function hasRunToday(jobName: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const existing = await db.query.jobRuns.findFirst({
    where: and(
      eq(schema.jobRuns.jobName, jobName),
      gte(schema.jobRuns.startedAt, todayStart),
    ),
    columns: { id: true },
  });

  return !!existing;
}

async function recordJobStart(jobName: string): Promise<string> {
  const [run] = await db
    .insert(schema.jobRuns)
    .values({ jobName, status: "running" })
    .returning({ id: schema.jobRuns.id });
  return run.id;
}

async function recordJobEnd(
  runId: string,
  status: "completed" | "failed",
  metadata?: Record<string, unknown>,
) {
  await db
    .update(schema.jobRuns)
    .set({ status, completedAt: new Date(), metadata })
    .where(eq(schema.jobRuns.id, runId));
}

async function executeJob(job: ScheduledJob) {
  if (!job.skipDedup) {
    const alreadyRan = await hasRunToday(job.name).catch(() => false);
    if (alreadyRan) {
      console.log(`[scheduler] ${job.name} already ran today, skipping`);
      return;
    }
  }

  // For skipDedup jobs (like daily_ping), just run the handler directly
  // since they manage their own per-user deduplication
  if (job.skipDedup) {
    try {
      await job.handler();
    } catch (err) {
      console.error(`[scheduler] ${job.name} failed:`, err);
    }
    return;
  }

  const runId = await recordJobStart(job.name);
  console.log(`[scheduler] Running ${job.name} (run: ${runId})`);

  try {
    await job.handler();
    await recordJobEnd(runId, "completed");
    console.log(`[scheduler] ${job.name} completed`);
  } catch (err) {
    console.error(`[scheduler] ${job.name} failed:`, err);
    await recordJobEnd(runId, "failed", {
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
  }
}

export function startScheduler() {
  console.log("[scheduler] Starting job scheduler");

  const checkInterval = 60_000;

  setInterval(() => {
    const now = new Date();

    for (const job of jobs) {
      if (!job.enabled) continue;

      const schedule = parseCron(job.cronExpression);
      const matches =
        now.getHours() === schedule.hour &&
        now.getMinutes() === schedule.minute &&
        (schedule.dayOfWeek === undefined ||
          now.getDay() === schedule.dayOfWeek);

      if (matches) {
        executeJob(job).catch(() => {});
      }
    }
  }, checkInterval);

  console.log(
    `[scheduler] Registered ${jobs.filter((j) => j.enabled).length} jobs`,
  );
}
