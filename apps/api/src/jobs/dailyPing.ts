import { db, schema } from "../db";
import { eq, isNotNull, sql, gte, lte, isNull, desc, and } from "drizzle-orm";
import { loadMemoryProfile } from "../services/retrieval";
import { callClaude } from "../ai/client";
import { sendPushNotification } from "../services/notifications";
import { getPendingReminders } from "../services/reminderService";
import type { NotificationPreferences } from "../db/auth-schema";

/**
 * Runs every minute. Checks which users have a dailyPingTime matching
 * the current time (in their timezone) and sends them a contextual
 * check-in message via their active conversation + an Expo push notification.
 */
export async function runDailyPing() {
  const now = new Date();

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

      if (!isTimeToNotify(now, prefs.dailyPingTime, prefs.timezone)) continue;

      const todayStr = now.toISOString().split("T")[0];
      const alreadyPinged = await db.query.jobRuns.findFirst({
        where: sql`${schema.jobRuns.jobName} = 'daily_ping' AND ${schema.jobRuns.userId} = ${userRow.id} AND ${schema.jobRuns.startedAt}::date = ${todayStr}::date`,
      });
      if (alreadyPinged) continue;

      const profile = await loadMemoryProfile(userRow.id);
      const displayName = profile?.personalInfo.preferredName ?? userRow.name ?? "there";
      const allyName = userRow.allyName ?? "Anzi";

      // Build prioritized context: followups → upcoming events → recent session → goals
      const contextParts: string[] = [];

      const pendingFollowups = (profile?.pendingFollowups ?? []).filter((f) => !f.resolved);
      if (pendingFollowups.length > 0) {
        contextParts.push(
          `Unresolved follow-ups (highest priority — pick the most important one):\n${pendingFollowups
            .slice(0, 3)
            .map((f) => `- [${f.priority}] ${f.topic}: ${f.context}`)
            .join("\n")}`,
        );
      }

      const sevenDaysOut = new Date(now);
      sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
      const upcomingEvents = await db.query.memoryEvents.findMany({
        where: (t, { and, eq: deq }) =>
          and(
            deq(t.userId, userRow.id),
            gte(t.eventDate, now),
            lte(t.eventDate, sevenDaysOut),
            isNull(t.completedAt),
          ),
        columns: { content: true, eventDate: true },
        orderBy: schema.memoryEvents.eventDate,
        limit: 3,
      });
      if (upcomingEvents.length > 0) {
        contextParts.push(
          `Upcoming events:\n${upcomingEvents
            .map((e) => `- ${e.content} (${e.eventDate.toISOString().split("T")[0]})`)
            .join("\n")}`,
        );
      }

      // Fetch upcoming reminders for additional context
      const upcomingReminders = await getPendingReminders(userRow.id, 5).catch(() => []);
      const todayReminders = upcomingReminders.filter((r) => {
        const remindDate = new Date(r.remindAt);
        return remindDate.toISOString().split("T")[0] === now.toISOString().split("T")[0];
      });
      if (todayReminders.length > 0) {
        contextParts.push(
          `Reminders set for today:\n${todayReminders
            .map((r) => `- ${r.title}${r.body ? `: ${r.body}` : ""}`)
            .join("\n")}`,
        );
      }

      const lastSession = await db.query.sessions.findFirst({
        where: eq(schema.sessions.userId, userRow.id),
        orderBy: [desc(schema.sessions.startedAt)],
        columns: { summary: true },
      });
      if (lastSession?.summary) {
        contextParts.push(`What we last talked about:\n${lastSession.summary}`);
      }

      const activeGoals = (profile?.goals ?? []).filter((g) => g.status === "active");
      if (activeGoals.length > 0) {
        contextParts.push(
          `Active goals:\n${activeGoals
            .slice(0, 3)
            .map((g) => `- ${g.description} (${g.category})`)
            .join("\n")}`,
        );
      }

      const contextBlock =
        contextParts.length > 0
          ? `\n\nContext to draw from (pick the most relevant thread — do NOT mention all of these):\n${contextParts.join("\n\n")}`
          : "";

      const { text } = await callClaude({
        system: `You are ${allyName}, a personal AI companion for ${displayName}. Write a single brief, warm check-in message (1-2 sentences). Sound like a caring friend sending a casual text — not a notification or reminder app. Pick ONE thread from the context and check in on it naturally. If there's a pending follow-up or upcoming event, that takes priority. Don't be generic. Don't list things. Don't use emojis excessively.${contextBlock}`,
        messages: [{ role: "user", content: "Generate the daily check-in message." }],
        maxTokens: 200,
      });

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

      if (userRow.expoPushToken) {
        await sendPushNotification(
          userRow.expoPushToken,
          allyName,
          text,
          { type: "daily_ping" },
        ).catch((err) => {
          console.warn(`[daily_ping] Push notification failed for ${userRow.id}:`, err);
        });
      }

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
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
    const userLocalTime = formatter.format(now);
    const normalize = (t: string) => t.replace(/\s+/g, " ").trim().toUpperCase();
    return normalize(userLocalTime) === normalize(dailyPingTime);
  } catch {
    return false;
  }
}
