import { callClaude, estimateTokens } from "./client";
import { buildBriefingSystemPrompt } from "./prompts";
import { loadMemoryProfile } from "../services/retrieval";
import { db, schema } from "../db";
import { eq, and, gte, lte, count } from "drizzle-orm";
import type { MemoryProfile } from "@ally/shared";

const BRIEFING_USER_MSG_BUDGET = 6_000;

interface CalendarEventInput {
  title: string;
  date: string;
  time: string;
  assignedTo?: string;
}

interface TaskInput {
  title: string;
  assignedTo?: string;
  dueDate?: string;
}

export async function generateBriefing(input: {
  profile: MemoryProfile;
  calendarEvents: CalendarEventInput[];
  pendingTasks: TaskInput[];
  date: string;
  sessionCount: number;
}): Promise<{ content: string; tokensUsed: number }> {
  const name = input.profile.personalInfo.preferredName ?? "there";

  const parts: string[] = [`User: ${name}`, `Date: ${input.date}`];

  if (input.calendarEvents.length > 0) {
    parts.push(
      `\nFamily schedule (today + next 3 days):\n${input.calendarEvents.map((e) => `- ${e.title} — ${e.date} ${e.time}${e.assignedTo ? ` (${e.assignedTo})` : ""}`).join("\n")}`,
    );
  }

  if (input.pendingTasks.length > 0) {
    parts.push(
      `\nPending to-do items:\n${input.pendingTasks.map((t) => `- ${t.title}${t.assignedTo ? ` [${t.assignedTo}]` : ""}${t.dueDate ? ` (due ${t.dueDate})` : ""}`).join("\n")}`,
    );
  }

  let userMessage = parts.join("\n");
  if (estimateTokens(userMessage) > BRIEFING_USER_MSG_BUDGET) {
    const charLimit = Math.floor(BRIEFING_USER_MSG_BUDGET * 3.2);
    userMessage = userMessage.slice(0, charLimit) + "\n…[context trimmed]";
  }

  const { text, tokensUsed } = await callClaude({
    system: buildBriefingSystemPrompt(input.sessionCount),
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 256,
  });

  return { content: text, tokensUsed };
}

/**
 * Ensure a briefing exists for userId today. Creates one if missing.
 * Briefings are scoped to pending tasks and family calendar events only.
 */
export async function ensureBriefingForUser(userId: string): Promise<
  | {
      id: string;
      date: string;
      content: string;
      delivered: boolean;
      createdAt: string;
    }
  | null
> {
  const today = new Date().toISOString().split("T")[0];

  const existing = await db.query.briefings.findFirst({
    where: and(
      eq(schema.briefings.userId, userId),
      eq(schema.briefings.date, today),
    ),
  });

  if (existing) {
    return {
      id: existing.id,
      date: existing.date,
      content: existing.content,
      delivered: existing.delivered,
      createdAt: existing.createdAt.toISOString(),
    };
  }

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { tier: true, familyId: true },
  });
  if (!user) return null;

  const profile = await loadMemoryProfile(userId);
  if (!profile) return null;

  const now = new Date();
  const threeDaysOut = new Date(now);
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);

  const familyId = user.familyId;
  let calendarEvents: CalendarEventInput[] = [];
  let pendingTasks: TaskInput[] = [];

  if (familyId) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const [calendarRows, familyMembers, taskRows] = await Promise.all([
      db
        .select()
        .from(schema.calendarEvents)
        .where(
          and(
            eq(schema.calendarEvents.familyId, familyId),
            gte(schema.calendarEvents.startTime, dayStart),
            lte(schema.calendarEvents.startTime, threeDaysOut),
          ),
        )
        .orderBy(schema.calendarEvents.startTime)
        .limit(20),
      db
        .select({ id: schema.familyMembers.id, name: schema.familyMembers.name })
        .from(schema.familyMembers)
        .where(eq(schema.familyMembers.familyId, familyId)),
      db
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.familyId, familyId),
            eq(schema.tasks.status, "pending"),
          ),
        )
        .limit(15),
    ]);

    const memberMap = new Map(familyMembers.map((m) => [m.id, m.name]));

    calendarEvents = calendarRows.map((e) => ({
      title: e.title,
      date: e.startTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      time: e.allDay ? "all day" : e.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      assignedTo: (e.assignedTo as string[])?.map((id) => memberMap.get(id)).filter(Boolean).join(", ") || undefined,
    }));

    pendingTasks = taskRows.map((t) => ({
      title: t.title,
      assignedTo: t.assignedTo ? memberMap.get(t.assignedTo) ?? undefined : undefined,
      dueDate: t.dueDate ? t.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : undefined,
    }));
  }

  const [sessionCountResult] = await db
    .select({ value: count() })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId));
  const sessionCount = sessionCountResult?.value ?? 0;

  const { content } = await generateBriefing({
    profile,
    calendarEvents,
    pendingTasks,
    date: today,
    sessionCount,
  });

  const [inserted] = await db
    .insert(schema.briefings)
    .values({ userId, date: today, content })
    .onConflictDoNothing()
    .returning();

  if (!inserted) return null;

  return {
    id: inserted.id,
    date: inserted.date,
    content: inserted.content,
    delivered: inserted.delivered,
    createdAt: inserted.createdAt.toISOString(),
  };
}
