import { callClaude, estimateTokens } from "./client";
import { buildBriefingSystemPrompt } from "./prompts";
import { retrieveRelevantFacts, loadMemoryProfile } from "../services/retrieval";
import { db, schema } from "../db";
import { eq, and, gte, lte, isNull, count } from "drizzle-orm";
import type { MemoryProfile, PendingFollowup } from "@ally/shared";

/** Max tokens for the entire user-message portion of the briefing prompt. */
const BRIEFING_USER_MSG_BUDGET = 6_000;
/** Max pending follow-ups to include in a briefing. */
const MAX_FOLLOWUPS = 10;
/** Max characters per follow-up context string. */
const MAX_FOLLOWUP_CONTEXT_CHARS = 300;
/** Max characters per relevant-fact content string. */
const MAX_FACT_CONTENT_CHARS = 500;

export async function generateBriefing(input: {
  profile: MemoryProfile;
  relevantFacts: { content: string; category: string }[];
  upcomingEvents: { content: string; eventDate: string }[];
  pendingFollowups: PendingFollowup[];
  date: string;
  sessionCount: number;
}): Promise<{ content: string; tokensUsed: number }> {
  const name = input.profile.personalInfo.preferredName ?? "there";

  const parts: string[] = [`User: ${name}`, `Date: ${input.date}`];

  if (input.upcomingEvents.length > 0) {
    parts.push(
      `\nUpcoming events:\n${input.upcomingEvents.map((e) => `- ${e.content} (${e.eventDate})`).join("\n")}`,
    );
  }

  if (input.pendingFollowups.length > 0) {
    const capped = input.pendingFollowups.slice(0, MAX_FOLLOWUPS);
    parts.push(
      `\nPending follow-ups:\n${capped.map((f) => `- [${f.priority}] ${f.topic}: ${(f.context ?? "").slice(0, MAX_FOLLOWUP_CONTEXT_CHARS)}`).join("\n")}`,
    );
  }

  if (input.relevantFacts.length > 0) {
    parts.push(
      `\nRelevant context:\n${input.relevantFacts.map((f) => `- [${f.category}] ${f.content.slice(0, MAX_FACT_CONTENT_CHARS)}`).join("\n")}`,
    );
  }

  const activeGoals = input.profile.goals.filter((g) => g.status === "active").slice(0, 10);
  if (activeGoals.length > 0) {
    parts.push(
      `\nActive goals:\n${activeGoals.map((g) => `- ${g.description} (${g.category})`).join("\n")}`,
    );
  }

  // Final safety: truncate the user message if it still exceeds the budget
  let userMessage = parts.join("\n");
  if (estimateTokens(userMessage) > BRIEFING_USER_MSG_BUDGET) {
    const charLimit = Math.floor(BRIEFING_USER_MSG_BUDGET * 3.2);
    userMessage = userMessage.slice(0, charLimit) + "\n…[context trimmed]";
  }

  const { text, tokensUsed } = await callClaude({
    system: buildBriefingSystemPrompt(input.sessionCount),
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 512,
  });

  return { content: text, tokensUsed };
}

/**
 * Ensure a briefing exists for userId today. Creates one if missing.
 * This is the single entry point for all briefing generation paths.
 * Returns the briefing row, or null if the user is ineligible.
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

  // Use the semantic retrieval pipeline for relevant context
  const relevantFacts = await retrieveRelevantFacts({
    userId,
    query: "family schedule today upcoming events tasks",
    limit: 12,
  }).catch(() => [] as Awaited<ReturnType<typeof retrieveRelevantFacts>>);

  // Pull upcoming memory events within the next 7 days
  const now = new Date();
  const sevenDaysOut = new Date(now);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const threeDaysOut = new Date(now);
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);

  const upcomingEvents = await db.query.memoryEvents.findMany({
    where: and(
      eq(schema.memoryEvents.userId, userId),
      gte(schema.memoryEvents.eventDate, now),
      lte(schema.memoryEvents.eventDate, sevenDaysOut),
      isNull(schema.memoryEvents.completedAt),
    ),
    columns: { content: true, eventDate: true },
    orderBy: schema.memoryEvents.eventDate,
    limit: 5,
  });

  // Pull family calendar events for today + next 3 days
  const familyId = user.familyId;
  let calendarContext = "";
  let taskContext = "";
  let shoppingContext = "";

  if (familyId) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const [calendarEvents, familyMembers, pendingTasksRaw, shoppingLists] = await Promise.all([
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
        .limit(10),
      db
        .select()
        .from(schema.shoppingLists)
        .where(eq(schema.shoppingLists.familyId, familyId))
        .limit(1),
    ]);

    const memberMap = new Map(familyMembers.map((m) => [m.id, m.name]));

    if (calendarEvents.length > 0) {
      calendarContext = "\nFamily calendar (today + next 3 days):\n" +
        calendarEvents.map((e) => {
          const date = e.startTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          const time = e.allDay ? "all day" : e.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          const assigned = (e.assignedTo as string[])?.map((id) => memberMap.get(id)).filter(Boolean).join(", ") || "";
          return `- ${e.title} — ${date} ${time}${assigned ? ` (${assigned})` : ""}`;
        }).join("\n");
    }

    if (pendingTasksRaw.length > 0) {
      taskContext = "\nPending tasks:\n" +
        pendingTasksRaw.map((t) => {
          const assignee = t.assignedTo ? memberMap.get(t.assignedTo) : null;
          const due = t.dueDate ? ` (due ${t.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : "";
          return `- ${t.title}${assignee ? ` [${assignee}]` : ""}${due}`;
        }).join("\n");
    }

    if (shoppingLists.length > 0) {
      const items = await db
        .select()
        .from(schema.shoppingListItems)
        .where(eq(schema.shoppingListItems.listId, shoppingLists[0].id));
      const unchecked = items.filter((i) => !i.checked);
      if (unchecked.length > 0) {
        shoppingContext = `\nGrocery list: ${unchecked.length} items remaining (${unchecked.slice(0, 5).map((i) => i.name).join(", ")}${unchecked.length > 5 ? "..." : ""})`;
      }
    }
  }

  const pendingFollowups = (profile.pendingFollowups ?? []).filter(
    (f) => !f.resolved,
  );

  const [sessionCountResult] = await db
    .select({ value: count() })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId));
  const sessionCount = sessionCountResult?.value ?? 0;

  const { content } = await generateBriefing({
    profile,
    relevantFacts: [
      ...relevantFacts.map((f) => ({
        content: f.content,
        category: f.category ?? "general",
      })),
      ...(calendarContext ? [{ content: calendarContext, category: "schedule" }] : []),
      ...(taskContext ? [{ content: taskContext, category: "tasks" }] : []),
      ...(shoppingContext ? [{ content: shoppingContext, category: "shopping" }] : []),
    ],
    upcomingEvents: upcomingEvents.map((e) => ({
      content: e.content,
      eventDate: e.eventDate.toISOString().split("T")[0],
    })),
    pendingFollowups,
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
