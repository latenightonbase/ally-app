import { db, schema } from "../db";
import { eq, isNotNull, sql, gte, lte, isNull, desc, and } from "drizzle-orm";
import { loadMemoryProfile } from "../services/retrieval";
import { callClaude } from "../ai/client";
import { sendPushNotification } from "../services/notifications";
import { getPendingReminders } from "../services/reminderService";
import type { NotificationPreferences } from "../db/auth-schema";

// ── Time parsing ────────────────────────────────────────────────────

/**
 * Parse a dailyPingTime string in either 24h ("09:00", "15:00") or
 * 12h ("9 AM", "3 PM", "9:00 AM") format into { hours, minutes }.
 */
function parsePingTime(raw: string): { hours: number; minutes: number } | null {
  // 24h format: "09:00", "15:00"
  const match24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return { hours: parseInt(match24[1], 10), minutes: parseInt(match24[2], 10) };
  }

  // 12h format: "9 AM", "9:00 AM", "12 PM"
  const match12 = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2] ?? "0", 10);
    const period = match12[3].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  return null;
}

/**
 * Compute the next UTC Date when the user's daily ping should fire,
 * given their preferred local time and timezone.
 *
 * If the target time hasn't passed yet today (in their timezone), the
 * next fire is today at that time. Otherwise it's tomorrow.
 */
export function computeNextDailyPing(
  dailyPingTime: string,
  timezone: string,
): Date | null {
  const parsed = parsePingTime(dailyPingTime);
  if (!parsed) return null;
  const { hours: targetH, minutes: targetM } = parsed;

  try {
    const now = new Date();

    // Get today's date string in the user's timezone (YYYY-MM-DD via en-CA)
    const dateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    // Get current time in the user's timezone (24h)
    const timeFmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const localDateStr = dateFmt.format(now);
    const localTimeStr = timeFmt.format(now);
    const [localH, localM] = localTimeStr.split(":").map(Number);

    // Has today's target time already passed? (+1 min buffer)
    const alreadyPassed =
      localH * 60 + localM >= targetH * 60 + targetM + 1;

    let targetDateStr = localDateStr;
    if (alreadyPassed) {
      const tomorrow = new Date(now.getTime() + 86_400_000);
      targetDateStr = dateFmt.format(tomorrow);
    }

    // Construct a UTC guess at the target time
    const hh = String(targetH).padStart(2, "0");
    const mm = String(targetM).padStart(2, "0");
    const guessUtc = new Date(`${targetDateStr}T${hh}:${mm}:00.000Z`);

    // Check what local time this UTC instant actually maps to
    const checkTimeStr = timeFmt.format(guessUtc);
    const [checkH, checkM] = checkTimeStr.split(":").map(Number);

    // Calculate the offset to correct our guess
    let diffMinutes = checkH * 60 + checkM - (targetH * 60 + targetM);

    // Handle day boundary wrapping (e.g., UTC 23:00 → Tokyo 08:00 next day)
    if (diffMinutes > 720) diffMinutes -= 1440;
    if (diffMinutes < -720) diffMinutes += 1440;

    return new Date(guessUtc.getTime() - diffMinutes * 60_000);
  } catch {
    return null;
  }
}

// ── Main job ────────────────────────────────────────────────────────

/**
 * Runs every minute. Checks which users have a nextDailyPingAt that has
 * passed and sends them a contextual check-in message + push notification.
 * After firing, reschedules the next ping exactly 24h from the planned
 * time (not from now) to prevent drift.
 *
 * Also backfills nextDailyPingAt for existing users who have preferences
 * but no scheduled timestamp yet (pre-migration users).
 */
export async function runDailyPing() {
  const now = new Date();

  // ── Backfill: compute nextDailyPingAt for users who don't have one yet ──
  const usersNeedingBackfill = await db
    .select({
      id: schema.user.id,
      notificationPreferences: schema.user.notificationPreferences,
    })
    .from(schema.user)
    .where(
      and(
        isNotNull(schema.user.notificationPreferences),
        isNull(schema.user.nextDailyPingAt),
      ),
    )
    .limit(50);

  for (const u of usersNeedingBackfill) {
    try {
      const prefs = u.notificationPreferences as NotificationPreferences | null;
      if (!prefs?.dailyPingTime || !prefs?.timezone) continue;

      const nextPing = computeNextDailyPing(prefs.dailyPingTime, prefs.timezone);
      if (nextPing) {
        await db
          .update(schema.user)
          .set({ nextDailyPingAt: nextPing })
          .where(eq(schema.user.id, u.id));
        console.log(
          `[daily_ping] Backfilled nextDailyPingAt for ${u.id}: ${nextPing.toISOString()}`,
        );
      }
    } catch (err) {
      console.error(`[daily_ping] Backfill failed for ${u.id}:`, err);
    }
  }

  // ── Main loop: process users whose ping is due ────────────────────
  const dueUsers = await db
    .select({
      id: schema.user.id,
      notificationPreferences: schema.user.notificationPreferences,
      expoPushToken: schema.user.expoPushToken,
      name: schema.user.name,
      allyName: schema.user.allyName,
      nextDailyPingAt: schema.user.nextDailyPingAt,
    })
    .from(schema.user)
    .where(
      and(
        isNotNull(schema.user.nextDailyPingAt),
        lte(schema.user.nextDailyPingAt, now),
      ),
    )
    .limit(100);

  if (dueUsers.length === 0) return;

  console.log(`[daily_ping] ${dueUsers.length} user(s) due for daily ping`);

  for (const userRow of dueUsers) {
    try {
      // Immediately reschedule 24h from the *planned* time (not from now)
      // to prevent drift. If the ping fires late, the next one stays anchored.
      const nextPing = new Date(userRow.nextDailyPingAt!.getTime() + 24 * 3_600_000);
      await db
        .update(schema.user)
        .set({ nextDailyPingAt: nextPing })
        .where(eq(schema.user.id, userRow.id));

      // Dedup: skip if we already sent a ping today for this user
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

      console.log(`[daily_ping] Sent to ${userRow.id}, next at ${nextPing.toISOString()}`);
    } catch (err) {
      console.error(`[daily_ping] Failed for ${userRow.id}:`, err);
    }
  }
}
