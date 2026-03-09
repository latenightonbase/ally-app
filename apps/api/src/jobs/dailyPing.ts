import { db, schema } from "../db";
import { isNotNull, sql } from "drizzle-orm";
import { loadMemoryProfile } from "../services/retrieval";
import { callClaude } from "../ai/client";
import type { NotificationPreferences } from "../db/auth-schema";

/**
 * Runs every minute. Checks which users have a dailyPingTime matching
 * the current time (in their timezone) and sends them a conversational
 * message via their active conversation + an Expo push notification.
 */
export async function runDailyPing() {
  const now = new Date();

  // Fetch all users who have notification preferences set
  const usersWithPrefs = await db
    .select({
      id: schema.user.id,
      notificationPreferences: schema.user.notificationPreferences,
      expoPushToken: schema.user.expoPushToken,
      name: schema.user.name,
      allyName: schema.user.allyName,
    })
    .from(schema.user)
    .where(isNotNull(schema.user.notificationPreferences));

  for (const userRow of usersWithPrefs) {
    try {
      const prefs = userRow.notificationPreferences as NotificationPreferences | null;
      if (!prefs?.dailyPingTime || !prefs?.timezone) continue;

      // Check if the current time matches the user's preferred ping time
      if (!isTimeToNotify(now, prefs.dailyPingTime, prefs.timezone)) continue;

      // Check if we already pinged this user today
      const todayStr = now.toISOString().split("T")[0];
      const alreadyPinged = await db.query.jobRuns.findFirst({
        where: sql`${schema.jobRuns.jobName} = 'daily_ping' AND ${schema.jobRuns.userId} = ${userRow.id} AND ${schema.jobRuns.startedAt}::date = ${todayStr}::date`,
      });
      if (alreadyPinged) continue;

      const profile = await loadMemoryProfile(userRow.id);
      const displayName = profile?.personalInfo.preferredName ?? userRow.name ?? "there";
      const allyName = userRow.allyName ?? "Ally";

      // Generate a short conversational ping
      const { text } = await callClaude({
        system: `You are ${allyName}, a personal AI companion. Write a brief, warm daily check-in message (1-2 sentences) for ${displayName}. Sound like a caring friend sending a casual text. Reference something from their memory profile if possible — a goal, interest, or recent topic. Don't be generic. Don't use emojis excessively. Vary your style — sometimes ask a question, sometimes share a thought, sometimes just say hi in a creative way.`,
        messages: [
          {
            role: "user",
            content: profile
              ? `Memory profile:\n${JSON.stringify(profile, null, 2)}`
              : `User name: ${displayName}. No memory profile yet.`,
          },
        ],
        maxTokens: 256,
      });

      // Insert message into user's most recent conversation (or create one)
      let conversationId: string;
      const recentConv = await db.query.conversations.findFirst({
        where: sql`${schema.conversations.userId} = ${userRow.id}`,
        orderBy: sql`${schema.conversations.lastMessageAt} DESC`,
        columns: { id: true },
      });

      if (recentConv) {
        conversationId = recentConv.id;
      } else {
        const [newConv] = await db
          .insert(schema.conversations)
          .values({ userId: userRow.id, preview: text.slice(0, 100) })
          .returning({ id: schema.conversations.id });
        conversationId = newConv.id;
      }

      await db.insert(schema.messages).values({
        conversationId,
        role: "ally",
        content: text,
      });

      // Send push notification if token exists
      if (userRow.expoPushToken) {
        await sendExpoPushNotification(
          userRow.expoPushToken,
          allyName,
          text,
        ).catch((err) => {
          console.warn(`[daily_ping] Push notification failed for ${userRow.id}:`, err);
        });
      }

      // Record the run
      await db.insert(schema.jobRuns).values({
        jobName: "daily_ping",
        userId: userRow.id,
        status: "completed",
        completedAt: new Date(),
        metadata: { message: text, conversationId },
      });

      console.log(`[daily_ping] Sent to ${userRow.id}`);
    } catch (err) {
      console.error(`[daily_ping] Failed for ${userRow.id}:`, err);
    }
  }
}

/**
 * Check if the current UTC time matches the user's preferred ping time
 * in their timezone (within a 1-minute window).
 */
function isTimeToNotify(now: Date, dailyPingTime: string, timezone: string): boolean {
  try {
    // Get the current time in the user's timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
    const userLocalTime = formatter.format(now);

    // Normalize both times for comparison
    const normalize = (t: string) =>
      t.replace(/\s+/g, " ").trim().toUpperCase();

    return normalize(userLocalTime) === normalize(dailyPingTime);
  } catch {
    return false;
  }
}

/**
 * Send a push notification via the Expo Push API.
 */
async function sendExpoPushNotification(
  token: string,
  title: string,
  body: string,
): Promise<void> {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      sound: "default",
      data: { type: "daily_ping" },
    }),
  });
}
