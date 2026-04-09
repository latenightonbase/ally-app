import { db, schema } from "../db";
import { eq, and, sql, desc, gte, lte, isNull } from "drizzle-orm";
import { callClaude } from "../ai/client";
import { loadMemoryProfile } from "./retrieval";
import { sendPushNotification } from "./notifications";
import { resolveSession } from "./session";
import type { NotificationPreferences } from "../db/auth-schema";
import type { CheckinType, MemoryProfile } from "@ally/shared";

// ── Configuration ───────────────────────────────────────────────────
const MAX_CHECKINS_PER_DAY: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/** Default quiet hours: no check-ins before 9am or after 9pm (user-local). */
const DEFAULT_QUIET_START = "21:00";
const DEFAULT_QUIET_END = "09:00";

/**
 * Probability that an eligible user receives a check-in on any given
 * 30-minute tick. Keeps timing feeling random rather than clockwork.
 * ~0.35 → on a "medium" plan (2/day) across 24 eligible half-hours
 * (12 waking hours), we'd expect ~8.4 "rolls", yielding ~2.9 hits,
 * but the daily cap clamps it to 2. The randomness means it won't
 * always fire at the exact same times.
 */
const TICK_PROBABILITY = 0.35;

// ── Casual check-in message templates (AI fallback) ─────────────────
// If Claude is unreachable, pick from these. They're intentionally
// simple — the AI path produces much richer, memory-aware messages.
const CASUAL_FALLBACKS: string[] = [
  "hey {name} — what's up?",
  "hey, what did you have for lunch today? 🍜",
  "any plans for the evening?",
  "how's your day going so far?",
  "hey {name}, anything exciting happening today?",
  "what's on your mind right now?",
  "hey, just checking in — how are you doing?",
  "how's the week treating you {name}?",
  "anything fun on the agenda today?",
  "hey {name} — you doing okay?",
];

let fallbackIdx = 0;
function pickFallback(name: string): string {
  const template = CASUAL_FALLBACKS[fallbackIdx % CASUAL_FALLBACKS.length];
  fallbackIdx++;
  return template
    .replace(/\{name\}/g, name)
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Time-of-day awareness for casual prompts ────────────────────────
type TimeOfDay = "morning" | "midday" | "afternoon" | "evening";

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour < 12) return "morning";
  if (hour < 14) return "midday";
  if (hour < 17) return "afternoon";
  return "evening";
}

function timeOfDayHints(tod: TimeOfDay): string {
  switch (tod) {
    case "morning":
      return "It's morning for the user. Could ask about their day ahead, sleep, breakfast, morning routine, or what they're looking forward to.";
    case "midday":
      return "It's around lunchtime. Could ask about lunch, how the morning went, or what they're up to.";
    case "afternoon":
      return "It's afternoon. Could ask how the day's going, any afternoon plans, or check in on energy/mood.";
    case "evening":
      return "It's evening. Could ask about dinner plans, how the day went, evening plans, or winding down.";
  }
}

// ── Core: generate a casual check-in via Claude ─────────────────────

async function generateCasualCheckin(
  userId: string,
  profile: MemoryProfile | null,
  allyName: string,
  timezone: string,
): Promise<{ content: string; type: CheckinType }> {
  const displayName =
    profile?.personalInfo?.preferredName ?? "there";

  // Determine user's local hour for time-aware prompts
  let localHour = new Date().getUTCHours();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    localHour = parseInt(formatter.format(new Date()), 10);
  } catch { /* fall back to UTC */ }

  const tod = getTimeOfDay(localHour);

  // Gather light context — we don't need the full retrieval pipeline,
  // just enough for a natural 1-liner.
  const contextParts: string[] = [];

  // Recent interests / topics
  if (profile?.interests?.length) {
    const recentInterests = profile.interests.slice(0, 5);
    contextParts.push(
      `Interests: ${recentInterests.map((i) => i.topic).join(", ")}`,
    );
  }

  // Active goals
  const activeGoals = (profile?.goals ?? []).filter((g) => g.status === "active");
  if (activeGoals.length > 0) {
    contextParts.push(
      `Active goals: ${activeGoals.slice(0, 3).map((g) => g.description).join("; ")}`,
    );
  }

  // Relationships (for social context)
  if (profile?.relationships?.length) {
    contextParts.push(
      `Key people: ${profile.relationships.slice(0, 4).map((r) => `${r.name} (${r.relation})`).join(", ")}`,
    );
  }

  // Health/routine
  if (profile?.health?.currentRoutine) {
    contextParts.push(`Routine: ${profile.health.currentRoutine}`);
  }

  // Work context
  if (profile?.work?.role) {
    contextParts.push(
      `Work: ${profile.work.role}${profile.work.company ? ` at ${profile.work.company}` : ""}`,
    );
  }

  // Last session summary for conversational continuity
  const lastSession = await db.query.sessions.findFirst({
    where: eq(schema.sessions.userId, userId),
    orderBy: [desc(schema.sessions.startedAt)],
    columns: { summary: true },
  });
  if (lastSession?.summary) {
    contextParts.push(`Last conversation: ${lastSession.summary}`);
  }

  // Dynamic attributes — personality insights
  if (profile?.dynamicAttributes) {
    const attrs = Object.entries(profile.dynamicAttributes)
      .slice(0, 3)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.value}`);
    if (attrs.length > 0) {
      contextParts.push(`Personality notes: ${attrs.join("; ")}`);
    }
  }

  const contextBlock =
    contextParts.length > 0
      ? `\n\nContext about this person (use sparingly — pick ONE thread at most, or just be casual):\n${contextParts.join("\n")}`
      : "";

  try {
    const { text } = await callClaude({
      system: `You are ${allyName}, a personal AI companion for ${displayName}. Write a single casual check-in message (1 sentence, 2 max). You're texting a close friend — not sending a notification. Be warm, witty, expressive.

${timeOfDayHints(tod)}

Rules:
- Sound like a real friend texting, not an AI or app
- Don't always ask a question — sometimes just share a vibe, reaction, or playful thought
- Vary your style: sometimes curious, sometimes playful, sometimes caring, sometimes a lil chaotic
- Reference their life ONLY if it feels natural (don't force it)
- Use emojis naturally like a real person — 1-2 per message is great (🔥❤️😭👀🫠🥹 etc.)
- No "just checking in" or "hope you're doing well" — be more original and show personality
- Don't mention you're an AI or that you're checking in on them
- Keep it SHORT — one text message, not a paragraph
- Show personality: "ok random but I just thought of you" or "hey don't forget you're literally amazing 🥹"${contextBlock}`,
      messages: [
        {
          role: "user",
          content: "Generate a casual check-in text message.",
        },
      ],
      maxTokens: 120,
    });

    return { content: text.trim(), type: "casual" as CheckinType };
  } catch (err) {
    console.warn("[checkin] Claude unavailable, using fallback template:", err);
    return {
      content: pickFallback(displayName),
      type: "casual" as CheckinType,
    };
  }
}

// ── Core: generate an event follow-up ───────────────────────────────

interface PastEvent {
  id: string;
  content: string;
  eventDate: Date;
  context: string | null;
}

async function generateEventFollowup(
  userId: string,
  event: PastEvent,
  profile: MemoryProfile | null,
  allyName: string,
): Promise<string> {
  const displayName =
    profile?.personalInfo?.preferredName ?? "there";

  const daysSince = Math.floor(
    (Date.now() - event.eventDate.getTime()) / 86_400_000,
  );
  const timeRef =
    daysSince === 0
      ? "today"
      : daysSince === 1
        ? "yesterday"
        : `${daysSince} days ago`;

  try {
    const { text } = await callClaude({
      system: `You are ${allyName}, a personal AI companion for ${displayName}. Write a single follow-up message (1-2 sentences) about an event that happened ${timeRef}. Sound like a friend who remembered and genuinely wants to know how it went.

Event: ${event.content}${event.context ? `\nContext: ${event.context}` : ""}

Rules:
- Be warm, expressive, and natural — like a friend who's been waiting to hear "so how did it go?? 👀"
- Show you remember the event without being robotic about it
- Match the event's tone but bring energy: stressful → encouraging with warmth ("you've got this 🔥"), fun → curious and hyped ("NEED the details immediately")
- Use 1-2 emojis naturally
- Keep it to 1-2 sentences
- No "I hope it went well" — react with personality and ask directly`,
      messages: [
        {
          role: "user",
          content: "Generate a follow-up message about this event.",
        },
      ],
      maxTokens: 150,
    });

    return text.trim();
  } catch (err) {
    console.warn("[checkin] Claude unavailable for event follow-up:", err);
    // Friendly fallback
    const lower = event.content.toLowerCase();
    if (/interview|exam|test|presentation/.test(lower)) {
      return `hey ${displayName} — how did ${event.content.toLowerCase()} go?? been thinking about it`;
    }
    return `hey ${displayName}, how was ${event.content.toLowerCase()}?`;
  }
}

// ── Delivery helpers ────────────────────────────────────────────────

async function deliverCheckin(
  userId: string,
  content: string,
  type: CheckinType,
  eventId: string | null,
  metadata: Record<string, unknown>,
): Promise<string> {
  // Find or create a conversation to deliver the message into
  let conversationId: string;
  const recentConv = await db.query.conversations.findFirst({
    where: sql`${schema.conversations.userId} = ${userId}`,
    orderBy: sql`${schema.conversations.lastMessageAt} DESC`,
    columns: { id: true },
  });

  if (recentConv) {
    conversationId = recentConv.id;
  } else {
    const [newConv] = await db
      .insert(schema.conversations)
      .values({ userId, preview: content.slice(0, 100) })
      .returning({ id: schema.conversations.id });
    conversationId = newConv.id;
  }

  // Resolve session so the message appears in active chat
  const sessionId = await resolveSession(userId, conversationId);

  // Insert the ally message
  await db.insert(schema.messages).values({
    conversationId,
    sessionId,
    role: "ally",
    content,
  });

  // Update conversation metadata
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId));

  await db
    .update(schema.conversations)
    .set({
      lastMessageAt: new Date(),
      messageCount: Number(countResult[0].count),
    })
    .where(eq(schema.conversations.id, conversationId));

  // Record the check-in
  const [checkin] = await db
    .insert(schema.checkins)
    .values({
      userId,
      conversationId,
      type,
      content,
      eventId,
      metadata,
    })
    .returning({ id: schema.checkins.id });

  // Attempt push notification (best-effort)
  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { expoPushToken: true, allyName: true },
  });

  let pushSent = false;
  if (userRow?.expoPushToken) {
    pushSent = await sendPushNotification(
      userRow.expoPushToken,
      userRow.allyName ?? "Anzi",
      content,
      {
        type: "checkin",
        checkinId: checkin.id,
        checkinType: type,
        conversationId,
      },
    ).catch(() => false);

    if (pushSent) {
      await db
        .update(schema.checkins)
        .set({ pushSent: true })
        .where(eq(schema.checkins.id, checkin.id));
    }
  }

  console.log(
    `[checkin] Delivered ${type} check-in ${checkin.id} to user ${userId} (push: ${pushSent})`,
  );

  return checkin.id;
}

// ── Eligibility & cooldown helpers ──────────────────────────────────

function isInQuietHours(
  timezone: string,
  quietStart: string,
  quietEnd: string,
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hour = parseInt(
      parts.find((p) => p.type === "hour")?.value ?? "0",
      10,
    );
    const minute = parseInt(
      parts.find((p) => p.type === "minute")?.value ?? "0",
      10,
    );
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = quietStart.split(":").map(Number);
    const [endH, endM] = quietEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
      // Quiet hours span midnight (e.g., 21:00 → 09:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false; // If we can't determine timezone, don't block
  }
}

async function getCheckinCountToday(userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.checkins)
    .where(
      and(
        eq(schema.checkins.userId, userId),
        gte(schema.checkins.deliveredAt, todayStart),
      ),
    );

  return Number(result[0]?.count ?? 0);
}

async function getHoursSinceLastCheckin(userId: string): Promise<number> {
  const last = await db.query.checkins.findFirst({
    where: eq(schema.checkins.userId, userId),
    orderBy: [desc(schema.checkins.deliveredAt)],
    columns: { deliveredAt: true },
  });

  if (!last) return Infinity;
  return (Date.now() - last.deliveredAt.getTime()) / 3_600_000;
}

// ── Main job: process random check-ins ──────────────────────────────

/**
 * Called every 30 minutes by the scheduler.
 * Scans eligible users (premium, opted-in, not in quiet hours, under daily cap)
 * and probabilistically sends casual check-ins or event follow-ups.
 */
export async function processCheckins(): Promise<void> {
  const now = new Date();

  // Fetch all users who have opted into proactive check-ins
  const eligibleUsers = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      allyName: schema.user.allyName,
      tier: schema.user.tier,
      notificationPreferences: schema.user.notificationPreferences,
      expoPushToken: schema.user.expoPushToken,
    })
    .from(schema.user)
    .where(sql`
      ${schema.user.tier} = 'premium'
      AND ${schema.user.notificationPreferences} IS NOT NULL
      AND (${schema.user.notificationPreferences}->>'proactiveCheckins')::boolean = true
      AND ${schema.user.expoPushToken} IS NOT NULL
    `);

  if (eligibleUsers.length === 0) return;

  console.log(`[checkin] Processing ${eligibleUsers.length} eligible users`);

  for (const userRow of eligibleUsers) {
    try {
      const prefs = userRow.notificationPreferences as NotificationPreferences;
      const timezone = prefs.timezone ?? "UTC";
      const frequency = prefs.checkinFrequency ?? "medium";
      const quietStart = prefs.quietHoursStart ?? DEFAULT_QUIET_START;
      const quietEnd = prefs.quietHoursEnd ?? DEFAULT_QUIET_END;

      // Skip if in quiet hours
      if (isInQuietHours(timezone, quietStart, quietEnd)) continue;

      // Skip if daily cap reached
      const todayCount = await getCheckinCountToday(userRow.id);
      const maxToday = MAX_CHECKINS_PER_DAY[frequency] ?? 2;
      if (todayCount >= maxToday) continue;

      // Minimum 3-hour gap between check-ins to avoid feeling spammy
      const hoursSinceLast = await getHoursSinceLastCheckin(userRow.id);
      if (hoursSinceLast < 3) continue;

      // Probabilistic gate — makes timing feel natural/random
      if (Math.random() > TICK_PROBABILITY) continue;

      const allyName = userRow.allyName ?? "Anzi";
      const profile = await loadMemoryProfile(userRow.id);

      // Priority 1: Follow up on past events that haven't been followed up on
      const pastEvents = await db
        .select({
          id: schema.memoryEvents.id,
          content: schema.memoryEvents.content,
          eventDate: schema.memoryEvents.eventDate,
          context: schema.memoryEvents.context,
        })
        .from(schema.memoryEvents)
        .where(
          and(
            eq(schema.memoryEvents.userId, userRow.id),
            lte(schema.memoryEvents.eventDate, now),
            gte(
              schema.memoryEvents.eventDate,
              new Date(now.getTime() - 3 * 86_400_000), // within last 3 days
            ),
            isNull(schema.memoryEvents.completedAt),
            isNull(schema.memoryEvents.followedUpAt),
          ),
        )
        .orderBy(schema.memoryEvents.eventDate)
        .limit(1);

      if (pastEvents.length > 0) {
        const event = pastEvents[0];
        const content = await generateEventFollowup(
          userRow.id,
          event,
          profile,
          allyName,
        );

        await deliverCheckin(
          userRow.id,
          content,
          "event_followup",
          event.id,
          { eventContent: event.content, eventDate: event.eventDate.toISOString() },
        );

        // Mark event as followed up
        await db
          .update(schema.memoryEvents)
          .set({ followedUpAt: new Date() })
          .where(eq(schema.memoryEvents.id, event.id));

        continue; // One check-in per tick per user
      }

      // Priority 2: Goal check-in (if they have active goals and we haven't
      // checked in on goals recently)
      const recentGoalCheckin = await db.query.checkins.findFirst({
        where: and(
          eq(schema.checkins.userId, userRow.id),
          eq(schema.checkins.type, "goal_checkin"),
          gte(
            schema.checkins.deliveredAt,
            new Date(now.getTime() - 3 * 86_400_000), // within last 3 days
          ),
        ),
        columns: { id: true },
      });

      const activeGoals = (profile?.goals ?? []).filter(
        (g) => g.status === "active",
      );
      if (!recentGoalCheckin && activeGoals.length > 0 && Math.random() < 0.3) {
        // 30% chance to do a goal check-in instead of casual
        const goal = activeGoals[Math.floor(Math.random() * activeGoals.length)];

        try {
          const { text } = await callClaude({
            system: `You are ${allyName}, a personal AI companion for ${profile?.personalInfo?.preferredName ?? "there"}. Write a single casual check-in (1-2 sentences) about their goal: "${goal.description}". Sound like a supportive friend, not a productivity app. Be encouraging but not pushy.`,
            messages: [
              {
                role: "user",
                content: "Generate a goal check-in text.",
              },
            ],
            maxTokens: 120,
          });

          await deliverCheckin(userRow.id, text.trim(), "goal_checkin", null, {
            goalDescription: goal.description,
          });
          continue;
        } catch {
          // Fall through to casual check-in
        }
      }

      // Priority 3: Casual check-in
      const { content, type } = await generateCasualCheckin(
        userRow.id,
        profile,
        allyName,
        timezone,
      );

      await deliverCheckin(userRow.id, content, type, null, {});
    } catch (err) {
      console.error(`[checkin] Failed for user ${userRow.id}:`, err);
    }
  }
}

/**
 * Get recent check-ins for a user (for display in settings or debugging).
 */
export async function getRecentCheckins(userId: string, limit = 10) {
  return db
    .select()
    .from(schema.checkins)
    .where(eq(schema.checkins.userId, userId))
    .orderBy(desc(schema.checkins.deliveredAt))
    .limit(limit);
}
