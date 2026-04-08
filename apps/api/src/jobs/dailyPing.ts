import { db, schema } from "../db";
import { eq, isNotNull, sql, gte, lte, isNull, desc, and } from "drizzle-orm";
import { loadMemoryProfile, retrieveRelevantFacts } from "../services/retrieval";
import { callClaude } from "../ai/client";
import { sendPushNotification } from "../services/notifications";
import { getPendingReminders } from "../services/reminderService";
import type { NotificationPreferences } from "../db/auth-schema";

/** Max age (in days) for a follow-up to be considered relevant for daily pings. */
const FOLLOWUP_MAX_AGE_DAYS = 14;

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

      // Fetch recent ping messages so Claude can avoid repeating itself
      const recentPings = await db.query.jobRuns.findMany({
        where: and(
          eq(schema.jobRuns.jobName, "daily_ping"),
          eq(schema.jobRuns.userId, userRow.id),
        ),
        orderBy: [desc(schema.jobRuns.startedAt)],
        columns: { metadata: true },
        limit: 5,
      });
      const previousMessages = recentPings
        .map((r) => (r.metadata as Record<string, unknown> | null)?.message as string | undefined)
        .filter(Boolean) as string[];

      const profile = await loadMemoryProfile(userRow.id);
      const displayName = profile?.personalInfo.preferredName ?? userRow.name ?? "there";
      const allyName = userRow.allyName ?? "Anzi";

      // Build prioritized context using FRESH data from vector/graph DBs
      const contextParts: string[] = [];

      // ── 1. Recent follow-ups (only those < FOLLOWUP_MAX_AGE_DAYS old) ──
      const followupCutoff = new Date(now);
      followupCutoff.setDate(followupCutoff.getDate() - FOLLOWUP_MAX_AGE_DAYS);
      const pendingFollowups = (profile?.pendingFollowups ?? [])
        .filter((f) => !f.resolved && new Date(f.detectedAt) >= followupCutoff)
        .sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
        });
      if (pendingFollowups.length > 0) {
        contextParts.push(
          `Recent follow-ups (pick the most important one):\n${pendingFollowups
            .slice(0, 3)
            .map((f) => `- [${f.priority}] ${f.topic}: ${f.context} (detected ${f.detectedAt})`)
            .join("\n")}`,
        );
      }

      // ── 2. Upcoming events (next 7 days) ──
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

      // ── 3. Today's reminders ──
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

      // ── 4. Last session summary ──
      const lastSession = await db.query.sessions.findFirst({
        where: eq(schema.sessions.userId, userRow.id),
        orderBy: [desc(schema.sessions.startedAt)],
        columns: { summary: true },
      });
      if (lastSession?.summary) {
        contextParts.push(`What we last talked about:\n${lastSession.summary}`);
      }

      // ── 5. Fresh memories from vector + graph retrieval (recency-aware) ──
      // This replaces the old static profile goals/interests with properly
      // reranked facts that respect supersession and recency decay.
      const retrievalQuery = lastSession?.summary
        ? `Daily check-in context: ${lastSession.summary}`
        : `Daily check-in for ${displayName} — recent life updates, goals, and current situation`;

      const freshMemories = await retrieveRelevantFacts({
        userId: userRow.id,
        query: retrievalQuery,
        limit: 8,
        // Heavily weight recency so stale facts don't surface
        semanticWeight: 0.3,
        recencyWeight: 0.5,
        importanceWeight: 0.2,
      }).catch((err) => {
        console.warn(`[daily_ping] Retrieval failed for ${userRow.id}:`, err);
        return [];
      });

      if (freshMemories.length > 0) {
        contextParts.push(
          `Current memories about ${displayName} (most recent and relevant — these are the ground truth):\n${freshMemories
            .map((m) => `- [${m.category}] ${m.content} (${m.createdAt.toISOString().split("T")[0]})`)
            .join("\n")}`,
        );
      }

      // ── 6. Active goals (only recently updated ones from profile) ──
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const activeGoals = (profile?.goals ?? [])
        .filter((g) => g.status === "active" && new Date(g.updatedAt) >= thirtyDaysAgo);
      if (activeGoals.length > 0) {
        contextParts.push(
          `Active goals (recently updated):\n${activeGoals
            .slice(0, 3)
            .map((g) => `- ${g.description} (${g.category}, updated ${g.updatedAt})`)
            .join("\n")}`,
        );
      }

      const contextBlock =
        contextParts.length > 0
          ? `\n\nContext to draw from (pick the most relevant thread — do NOT mention all of these):\n${contextParts.join("\n\n")}`
          : "";

      const previousMessagesBlock =
        previousMessages.length > 0
          ? `\n\nYour recent messages (DO NOT repeat these — vary your topic, tone, and sentence structure):\n${previousMessages.map((m) => `- "${m}"`).join("\n")}`
          : "";

      const { text } = await callClaude({
        system: `You are ${allyName}, a personal AI companion for ${displayName}. Write a single brief, warm check-in message (1-2 sentences). Sound like a caring friend sending a casual text — not a notification or reminder app.

CRITICAL RULES:
- Pick ONE thread from the context below and check in on it naturally.
- ONLY reference things that are CURRENTLY true. Each memory has a date — if something is from weeks/months ago (like a trip or event), do NOT assume it's still happening. Past trips are OVER. Past events have PASSED. The person is back to their normal life unless a very recent memory says otherwise.
- If there's an upcoming event or today's reminder, that takes priority.
- If the most relevant recent memories show a change (e.g., came back from a trip, changed jobs), reference the CURRENT state, not the old one.
- Don't be generic. Don't list things. Don't use emojis excessively.
- When in doubt, reference the most RECENT memory or the last session summary.

VARIETY — this is critical:
- Your recent messages are listed below. Do NOT reuse the same opening phrase, sentence structure, or topic as any of them.
- Vary your style: sometimes ask a question, sometimes make a comment, sometimes be playful, sometimes be direct. Mix it up.
- If you've already checked in about a topic recently, pick a DIFFERENT one.
- Never start two messages in a row with similar phrasing like "I know..." or "Hey, just...".${contextBlock}${previousMessagesBlock}`,
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
