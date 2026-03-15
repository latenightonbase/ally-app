import { on } from "./events";
import { db, schema } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { ensureBriefingForUser } from "../ai/briefing";
import { loadMemoryProfile } from "./retrieval";
import { callClaude } from "../ai/client";
import { sendPushNotification } from "./notifications";

export function registerProactiveHandlers() {
  on("user:app_opened", handleAppOpened);
  on("user:inactive", handleInactivity);
  on("system:daily_scan", runDailyScan);
  console.log("[proactive] Handlers registered");
}

async function handleAppOpened({ userId }: { userId: string }) {
  try {
    await ensureBriefingForUser(userId);
  } catch (err) {
    console.error(`[proactive] Briefing generation failed for ${userId}:`, err);
  }
}

async function handleInactivity({
  userId,
  inactiveDays,
}: {
  userId: string;
  inactiveDays: number;
}) {
  if (inactiveDays < 2) return;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const oneWeekAgoStr = oneWeekAgo.toISOString();

  const recentReengagement = await db.query.jobRuns.findFirst({
    where: and(
      eq(schema.jobRuns.jobName, "reengagement"),
      eq(schema.jobRuns.userId, userId),
      sql`${schema.jobRuns.startedAt} > ${oneWeekAgoStr}::timestamptz`,
    ),
  });

  if (recentReengagement) return;

  const profile = await loadMemoryProfile(userId);
  if (!profile) return;

  const name = profile.personalInfo.preferredName ?? "there";
  const { text } = await callClaude({
    system: `Write a brief, warm check-in message (1-2 sentences) from Ally to ${name}. Reference something specific from their memory profile if possible. Sound like a caring friend, not a notification.`,
    messages: [
      {
        role: "user",
        content: `Memory profile:\n${JSON.stringify(profile, null, 2)}`,
      },
    ],
    maxTokens: 256,
  });

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { expoPushToken: true, allyName: true },
  });

  if (user?.expoPushToken) {
    await sendPushNotification(
      user.expoPushToken,
      user.allyName ?? "Ally",
      text,
      { type: "reengagement" },
    ).catch(() => {});
  }

  await db.insert(schema.jobRuns).values({
    jobName: "reengagement",
    userId,
    status: "completed",
    completedAt: new Date(),
    metadata: { message: text, trigger: "inactivity", inactiveDays },
  });
}

/**
 * Periodic scan (runs every 30min via scheduler). Checks for
 * inactive users and emits events.
 */
async function runDailyScan() {
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  // db.execute() bypasses Drizzle's type coercion — pass ISO string, not Date
  const twoDaysAgoStr = twoDaysAgo.toISOString();

  const inactiveUsers = await db.execute<{
    user_id: string;
    last_activity: Date;
  }>(sql`
    SELECT u.id as user_id, MAX(c.last_message_at) as last_activity
    FROM ${schema.user} u
    LEFT JOIN ${schema.conversations} c ON c.user_id = u.id
    GROUP BY u.id
    HAVING MAX(c.last_message_at) < ${twoDaysAgoStr}::timestamptz
       OR MAX(c.last_message_at) IS NULL
  `);

  const { emit } = await import("./events");
  for (const row of inactiveUsers) {
    const daysSince = row.last_activity
      ? Math.floor(
          (Date.now() - new Date(row.last_activity).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 999;

    emit("user:inactive", { userId: row.user_id, inactiveDays: daysSince });
  }
}
