import { db, schema } from "../db";
import { eq, and, lte, sql } from "drizzle-orm";
import { sendPushNotification } from "./notifications";
import type { CreateReminderInput } from "@ally/shared";

/**
 * Create a new reminder that will trigger a push notification at the specified time.
 */
export async function createReminder(input: CreateReminderInput): Promise<string> {
  const remindAt = input.remindAt instanceof Date ? input.remindAt : new Date(input.remindAt);

  const [row] = await db
    .insert(schema.reminders)
    .values({
      userId: input.userId,
      title: input.title,
      body: input.body ?? null,
      remindAt,
      timezone: input.timezone ?? null,
      conversationId: input.conversationId ?? null,
      source: input.source ?? "chat",
      metadata: input.metadata ?? {},
    })
    .returning({ id: schema.reminders.id });

  console.log(
    `[reminders] Created reminder "${input.title}" for user ${input.userId} at ${remindAt.toISOString()}`,
  );

  return row.id;
}

/**
 * Find all pending reminders whose remind_at has passed and send push notifications.
 * Called every minute by the scheduler.
 */
export async function processReminders(): Promise<void> {
  const now = new Date();

  const dueReminders = await db
    .select({
      id: schema.reminders.id,
      userId: schema.reminders.userId,
      conversationId: schema.reminders.conversationId,
      title: schema.reminders.title,
      body: schema.reminders.body,
      metadata: schema.reminders.metadata,
    })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.status, "pending"),
        lte(schema.reminders.remindAt, now),
      ),
    )
    .limit(100);

  if (dueReminders.length === 0) return;

  for (const reminder of dueReminders) {
    try {
      // Look up user's push token and ally name
      const userRow = await db.query.user.findFirst({
        where: eq(schema.user.id, reminder.userId),
        columns: { expoPushToken: true, allyName: true },
      });

      if (userRow?.expoPushToken) {
        const allyName = userRow.allyName ?? "Anzi";
        const notificationBody = reminder.body ?? reminder.title;

        await sendPushNotification(
          userRow.expoPushToken,
          `${allyName} — Reminder`,
          notificationBody,
          {
            type: "reminder",
            reminderId: reminder.id,
            conversationId: reminder.conversationId,
          },
        );
      }

      // Also insert an in-conversation message so the user sees it in chat
      if (reminder.conversationId) {
        const messageText = reminder.body
          ? `hey, reminder: ${reminder.title} — ${reminder.body}`
          : `hey, reminder: ${reminder.title}`;

        await db.insert(schema.messages).values({
          conversationId: reminder.conversationId,
          role: "ally",
          content: messageText,
        });

        // Update conversation's lastMessageAt
        await db
          .update(schema.conversations)
          .set({ lastMessageAt: new Date() })
          .where(eq(schema.conversations.id, reminder.conversationId));
      }

      // Mark as sent
      await db
        .update(schema.reminders)
        .set({ status: "sent", notifiedAt: new Date() })
        .where(eq(schema.reminders.id, reminder.id));

      console.log(`[reminders] Sent reminder ${reminder.id} to user ${reminder.userId}`);
    } catch (err) {
      console.error(`[reminders] Failed to process reminder ${reminder.id}:`, err);
    }
  }
}

/**
 * Dismiss a reminder (user acknowledged it).
 */
export async function dismissReminder(
  userId: string,
  reminderId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(schema.reminders)
    .set({ status: "dismissed", dismissedAt: new Date() })
    .where(
      and(
        eq(schema.reminders.id, reminderId),
        eq(schema.reminders.userId, userId),
      ),
    )
    .returning({ id: schema.reminders.id });

  return !!updated;
}

/**
 * Get pending reminders for a user (upcoming).
 */
export async function getPendingReminders(userId: string, limit = 10) {
  return db
    .select()
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.userId, userId),
        eq(schema.reminders.status, "pending"),
      ),
    )
    .orderBy(schema.reminders.remindAt)
    .limit(limit);
}

/**
 * Try to parse a natural-language date/time reference into an absolute Date.
 * Falls back to a 24-hour-from-now default if parsing fails.
 */
export function parseReminderTime(
  timeRef: string,
  timezone?: string,
): Date {
  const now = new Date();
  const lower = timeRef.toLowerCase().trim();

  // Relative time patterns
  const inMinutes = lower.match(/in\s+(\d+)\s+min(ute)?s?/);
  if (inMinutes) {
    return new Date(now.getTime() + parseInt(inMinutes[1]) * 60_000);
  }

  const inHours = lower.match(/in\s+(\d+)\s+hours?/);
  if (inHours) {
    return new Date(now.getTime() + parseInt(inHours[1]) * 3600_000);
  }

  const inDays = lower.match(/in\s+(\d+)\s+days?/);
  if (inDays) {
    return new Date(now.getTime() + parseInt(inDays[1]) * 86400_000);
  }

  // "tomorrow" patterns
  if (lower.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const timeMatch = lower.match(/(\d{1,2})\s*(am|pm)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      if (timeMatch[2].toLowerCase() === "pm" && hours !== 12) hours += 12;
      if (timeMatch[2].toLowerCase() === "am" && hours === 12) hours = 0;
      tomorrow.setHours(hours, 0, 0, 0);
    } else {
      tomorrow.setHours(9, 0, 0, 0);
    }
    return tomorrow;
  }

  // "next week" pattern
  if (lower.includes("next week")) {
    return new Date(now.getTime() + 7 * 86400_000);
  }

  // Try ISO date parsing
  const isoDate = new Date(timeRef);
  if (!isNaN(isoDate.getTime()) && isoDate > now) {
    return isoDate;
  }

  // Default: remind in 24 hours
  return new Date(now.getTime() + 24 * 3600_000);
}
