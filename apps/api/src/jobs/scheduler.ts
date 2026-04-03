import { db, schema } from "../db";
import { eq, and, gte } from "drizzle-orm";
import { runDailyPing } from "./dailyPing";
import { runWeeklyInsights } from "./weeklyInsights";
import { runConsolidation } from "./consolidation";
import { runMemoryMaintenance } from "./memoryMaintenance";
import { emit } from "../services/events";
import { registerProactiveHandlers } from "../services/proactive";
import { flushAllBatches } from "../services/memoryQueue";
import { processReminders } from "../services/reminderService";
import { processCheckins } from "../services/checkinService";

interface ScheduledJob {
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
  enabled: boolean;
  skipDedup?: boolean;
}

const jobs: ScheduledJob[] = [
  {
    name: "daily_ping",
    cronExpression: "* * * * *",
    handler: runDailyPing,
    enabled: true,
    skipDedup: true,
  },
  {
    name: "check_reminders",
    cronExpression: "* * * * *",
    handler: processReminders,
    enabled: true,
    skipDedup: true,
  },
  {
    name: "weekly_insights",
    cronExpression: "0 20 * * 0",
    handler: runWeeklyInsights,
    enabled: true,
  },
  {
    name: "proactive_scan",
    cronExpression: "0,30 * * * *",
    handler: async () => {
      emit("system:daily_scan", {});
    },
    enabled: true,
    skipDedup: true,
  },
  {
    name: "flush_memory_queue",
    cronExpression: "*/5 * * * *",
    handler: async () => {
      flushAllBatches();
    },
    enabled: true,
    skipDedup: true,
  },
  {
    name: "random_checkins",
    cronExpression: "0,2 * * * *",
    handler: processCheckins,
    enabled: true,
    skipDedup: true,
  },
  {
    name: "memory_maintenance",
    cronExpression: "0 2 * * *",
    handler: runMemoryMaintenance,
    enabled: true,
  },
  {
    name: "memory_consolidation",
    cronExpression: "0 3 * * 0",
    handler: runConsolidation,
    enabled: true,
  },
];

function parseCron(expression: string): {
  minutes: number[];
  hours: number[];
  dayOfWeek?: number;
} {
  const [minuteStr, hourStr, , , dayOfWeek] = expression.split(" ");

  const parseField = (field: string): number[] => {
    if (field === "*") return [];
    if (field.startsWith("*/")) {
      const interval = Number(field.slice(2));
      return Array.from({ length: Math.floor(60 / interval) }, (_, i) => i * interval);
    }
    return field.split(",").map(Number);
  };

  return {
    minutes: parseField(minuteStr),
    hours: parseField(hourStr),
    dayOfWeek: dayOfWeek !== "*" ? Number(dayOfWeek) : undefined,
  };
}

function cronMatches(schedule: ReturnType<typeof parseCron>, now: Date): boolean {
  const minuteMatch = schedule.minutes.length === 0 || schedule.minutes.includes(now.getMinutes());
  const hourMatch = schedule.hours.length === 0 || schedule.hours.includes(now.getHours());
  const dowMatch = schedule.dayOfWeek === undefined || now.getDay() === schedule.dayOfWeek;
  return minuteMatch && hourMatch && dowMatch;
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
    if (alreadyRan) return;
  }

  if (job.skipDedup) {
    try {
      await job.handler();
    } catch (err) {
      console.error(`[scheduler] ${job.name} failed:`, err);
    }
    return;
  }

  const runId = await recordJobStart(job.name);

  try {
    await job.handler();
    await recordJobEnd(runId, "completed");
  } catch (err) {
    console.error(`[scheduler] ${job.name} failed:`, err);
    await recordJobEnd(runId, "failed", {
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
  }
}

export function startScheduler() {
  registerProactiveHandlers();

  const checkInterval = 60_000;

  setInterval(() => {
    const now = new Date();

    for (const job of jobs) {
      if (!job.enabled) continue;
      const schedule = parseCron(job.cronExpression);
      if (cronMatches(schedule, now)) {
        executeJob(job).catch(() => {});
      }
    }
  }, checkInterval);

  console.log(
    `[scheduler] Started with ${jobs.filter((j) => j.enabled).length} jobs + proactive handlers`,
  );
}
