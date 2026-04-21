import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { callClaudeWithTools } from "../ai/client";
import { PROACTIVE_AGENT_PROMPT } from "../ai/prompts";
import { executeToolCall, getCustomTools, type ToolContext } from "../ai/tools";

interface FamilySelection {
  familyId: string;
  familyName: string;
  userId: string;
  timezone: string | null;
}

const READ_ONLY_ACTION_TOOLS = new Set([
  "list_family_reminders",
  "list_family_tasks",
  "list_shopping_items",
  "list_family_events",
  "check_family_schedule",
  "recall_memory",
]);

const ACTION_TOOLS = new Set([
  "set_family_reminder",
  "assign_task",
  "add_to_shopping_list",
  "add_calendar_event",
]);

/**
 * Minimum hours between proactive_agent runs per user.
 * The scheduler also cron-limits how often the job runs globally.
 */
const MIN_HOURS_BETWEEN_RUNS = 4;

/**
 * Max number of families to process per invocation. Keeps cost predictable.
 */
const MAX_FAMILIES_PER_RUN = 10;

/**
 * Max tool calls the proactive agent can perform in a single run. This is a hard
 * cap enforced in addition to the prompt-level guidance.
 */
const MAX_ACTIONS_PER_RUN = 2;

function hoursSince(date: Date): number {
  return (Date.now() - date.getTime()) / 3_600_000;
}

async function selectFamiliesForRun(): Promise<FamilySelection[]> {
  const activityCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const rows = await db
    .select({
      familyId: schema.families.id,
      familyName: schema.families.name,
      userId: schema.families.createdBy,
      timezone: schema.families.timezone,
      lastMessageAt: sql<Date>`MAX(${schema.conversations.lastMessageAt})`.as(
        "last_message_at",
      ),
    })
    .from(schema.families)
    .leftJoin(
      schema.conversations,
      eq(schema.conversations.familyId, schema.families.id),
    )
    .groupBy(
      schema.families.id,
      schema.families.name,
      schema.families.createdBy,
      schema.families.timezone,
    );

  const active = rows.filter(
    (r) => r.lastMessageAt && new Date(r.lastMessageAt) >= activityCutoff,
  );

  active.sort(
    (a, b) =>
      new Date(b.lastMessageAt!).getTime() -
      new Date(a.lastMessageAt!).getTime(),
  );

  return active.slice(0, MAX_FAMILIES_PER_RUN).map((r) => ({
    familyId: r.familyId,
    familyName: r.familyName,
    userId: r.userId,
    timezone: r.timezone,
  }));
}

async function hasRunRecently(userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - MIN_HOURS_BETWEEN_RUNS * 3600 * 1000);
  const existing = await db.query.jobRuns.findFirst({
    where: and(
      eq(schema.jobRuns.jobName, "proactive_agent"),
      eq(schema.jobRuns.userId, userId),
      gte(schema.jobRuns.startedAt, cutoff),
    ),
    columns: { id: true },
  });
  return !!existing;
}

async function recordRun(
  userId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.jobRuns).values({
    jobName: "proactive_agent",
    userId,
    status: "completed",
    metadata,
    completedAt: new Date(),
  });
}

async function buildRecentContext(
  userId: string,
  familyId: string,
): Promise<string> {
  const lines: string[] = [];

  const recentConvs = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.userId, userId),
        eq(schema.conversations.familyId, familyId),
      ),
    )
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(1);

  if (recentConvs.length > 0) {
    const msgs = await db
      .select({
        role: schema.messages.role,
        content: schema.messages.content,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, recentConvs[0].id))
      .orderBy(desc(schema.messages.createdAt))
      .limit(12);

    if (msgs.length > 0) {
      lines.push("Recent chat (most recent last):");
      for (const m of msgs.reverse()) {
        const speaker = m.role === "user" ? "User" : "Anzi";
        const text = m.content.slice(0, 280).replace(/\s+/g, " ").trim();
        lines.push(`[${speaker}] ${text}`);
      }
    }
  }

  const upcomingCutoff = new Date(Date.now() + 48 * 3600 * 1000);
  const events = await db
    .select({
      title: schema.calendarEvents.title,
      startTime: schema.calendarEvents.startTime,
      assignedTo: schema.calendarEvents.assignedTo,
    })
    .from(schema.calendarEvents)
    .where(
      and(
        eq(schema.calendarEvents.familyId, familyId),
        gte(schema.calendarEvents.startTime, new Date()),
      ),
    )
    .orderBy(schema.calendarEvents.startTime)
    .limit(5);

  const upcomingEvents = events.filter(
    (e) => e.startTime && e.startTime <= upcomingCutoff,
  );
  if (upcomingEvents.length > 0) {
    lines.push("");
    lines.push("Upcoming events (next 48h):");
    for (const e of upcomingEvents) {
      lines.push(
        `- ${e.title} @ ${e.startTime?.toISOString() ?? "?"}`,
      );
    }
  }

  return lines.join("\n");
}

export async function runProactiveAgent(): Promise<void> {
  const families = await selectFamiliesForRun();
  if (families.length === 0) return;

  for (const fam of families) {
    try {
      if (await hasRunRecently(fam.userId)) continue;

      const context = await buildRecentContext(fam.userId, fam.familyId);
      if (!context) continue;

      const ctx: ToolContext = {
        userId: fam.userId,
        conversationId: "proactive-agent",
        familyId: fam.familyId,
        timezone: fam.timezone ?? undefined,
      };

      let actionsTaken = 0;

      const allTools = getCustomTools();
      const tools = allTools.filter(
        (t) =>
          READ_ONLY_ACTION_TOOLS.has(t.name) || ACTION_TOOLS.has(t.name),
      );

      const userMessage =
        `Family: ${fam.familyName}\n` +
        `Current time: ${new Date().toISOString()}\n` +
        `Timezone: ${fam.timezone ?? "unknown"}\n\n` +
        `Context:\n${context}\n\n` +
        `Decide if any time-sensitive action is warranted right now. If so, call at most ${MAX_ACTIONS_PER_RUN} action tool(s). Otherwise, return a minimal no-op summary.`;

      const result = await callClaudeWithTools({
        system: PROACTIVE_AGENT_PROMPT,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
        tools,
        maxTokens: 800,
        modelTier: "fast",
        onToolCall: async (name, input) => {
          if (ACTION_TOOLS.has(name)) {
            if (actionsTaken >= MAX_ACTIONS_PER_RUN) {
              return JSON.stringify({
                error: "action_limit_reached",
                message: `Already performed ${MAX_ACTIONS_PER_RUN} actions this run.`,
              });
            }
            actionsTaken += 1;
          }
          return executeToolCall(name, input, ctx);
        },
      });

      await recordRun(fam.userId, {
        familyId: fam.familyId,
        actions: actionsTaken,
        tokensUsed: result.tokensUsed,
        summary: result.text.slice(0, 500),
      });
    } catch (err) {
      console.error(
        `[proactive_agent] family=${fam.familyId} user=${fam.userId} failed:`,
        err,
      );
    }
  }
}

// quiet unused import warnings in case schema.users type narrows inArray usage
void inArray;
