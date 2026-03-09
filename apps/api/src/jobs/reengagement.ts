import { db, schema } from "../db";
import { eq, and, lt, sql } from "drizzle-orm";
import { loadMemoryProfile } from "../services/retrieval";
import { callClaude } from "../ai/client";

export async function runReengagement() {
  console.log("[reengagement] Starting...");

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const inactiveUsers = await db.execute<{
    user_id: string;
    last_activity: Date;
  }>(sql`
    SELECT u.id as user_id, MAX(c.last_message_at) as last_activity
    FROM ${schema.user} u
    LEFT JOIN ${schema.conversations} c ON c.user_id = u.id
    GROUP BY u.id
    HAVING MAX(c.last_message_at) < ${threeDaysAgo}
       OR MAX(c.last_message_at) IS NULL
  `);

  console.log(`[reengagement] Found ${inactiveUsers.length} inactive users`);

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  for (const row of inactiveUsers) {
    try {
      const recentNotification = await db.query.jobRuns.findFirst({
        where: and(
          eq(schema.jobRuns.jobName, "reengagement"),
          eq(schema.jobRuns.userId, row.user_id),
          sql`${schema.jobRuns.startedAt} > ${oneWeekAgo}`,
        ),
      });

      if (recentNotification) continue;

      const profile = await loadMemoryProfile(row.user_id);
      if (!profile) continue;

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

      await db.insert(schema.jobRuns).values({
        jobName: "reengagement",
        userId: row.user_id,
        status: "completed",
        completedAt: new Date(),
        metadata: { message: text },
      });

      console.log(`[reengagement] Queued for user ${row.user_id}`);
    } catch (err) {
      console.error(`[reengagement] Failed for user ${row.user_id}:`, err);
    }
  }

  console.log("[reengagement] Complete");
}
