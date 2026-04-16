import { retrieveRelevantFacts } from "../services/retrieval";
import { storeExtractedFacts, addFollowups } from "../services/memory";
import { createReminder, parseReminderTime } from "../services/reminderService";
import { notifyFamilyMembers } from "../services/notificationRouter";
import { db, schema } from "../db";
import { and, eq, gte, lte, between, isNull } from "drizzle-orm";
import type { ExtractedFact, MemoryCategory } from "@ally/shared";
import type Anthropic from "@anthropic-ai/sdk";

export interface ToolContext {
  userId: string;
  conversationId: string;
  familyId?: string;
  timezone?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
}

export function getWebSearchTool(ctx: ToolContext): Anthropic.Messages.Tool {
  const tool: Record<string, unknown> = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3,
  };

  if (ctx.location?.city || ctx.timezone) {
    tool.user_location = {
      type: "approximate",
      ...(ctx.location?.city && { city: ctx.location.city }),
      ...(ctx.location?.region && { region: ctx.location.region }),
      ...(ctx.location?.country && { country: ctx.location.country }),
      ...(ctx.timezone && { timezone: ctx.timezone }),
    };
  }

  return tool as unknown as Anthropic.Messages.Tool;
}

const MEMORY_CATEGORIES = [
  "personal_info",
  "relationships",
  "work",
  "health",
  "interests",
  "goals",
  "school",
  "activities",
  "dietary",
  "family_routines",
  "emotional_patterns",
] as const;

export function getCustomTools(): Anthropic.Messages.Tool[] {
  return [
    {
      name: "remember_fact",
      description:
        "Save an important fact about the family to long-term memory. Use this when the user shares something significant: family member details, allergies, school info, recurring schedules, dietary preferences, or important events. Do NOT use for trivial or transient information.",
      input_schema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "The fact to remember, stated clearly and concisely",
          },
          category: {
            type: "string",
            enum: [...MEMORY_CATEGORIES],
            description: "The category this fact belongs to",
          },
          importance: {
            type: "number",
            description:
              "How important? 0.9+ for allergies/health, 0.7-0.9 for schedules/schools, 0.5-0.7 for preferences, 0.1-0.4 for casual mentions",
          },
        },
        required: ["content", "category", "importance"],
      },
    },
    {
      name: "recall_memory",
      description:
        "Search your memory for facts about the family. Use this when you need to recall specific details — family member info, schedules, allergies, schools, preferences. The query should be specific.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "What you want to recall, e.g. 'Jake's allergies' or 'soccer schedule' or 'Emma's school'",
          },
          category: {
            type: "string",
            enum: [...MEMORY_CATEGORIES],
            description: "Optional: filter by category to narrow results",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "add_calendar_event",
      description:
        "Add an event to the family's shared calendar. Use this whenever the user mentions any appointment, activity, event, or scheduled commitment. Always specify which family members are involved.",
      input_schema: {
        type: "object" as const,
        properties: {
          title: {
            type: "string",
            description: "Event title — concise and clear (e.g. 'Jake's dentist appointment', 'Soccer practice')",
          },
          startTime: {
            type: "string",
            description: "When the event starts. Can be relative ('tomorrow at 3pm', 'next Thursday 4:00') or ISO datetime.",
          },
          endTime: {
            type: "string",
            description: "When the event ends. Optional — defaults to 1 hour after start.",
          },
          allDay: {
            type: "boolean",
            description: "Whether this is an all-day event (field trip, holiday, etc.)",
          },
          location: {
            type: "string",
            description: "Where the event takes place, if mentioned",
          },
          assignedTo: {
            type: "array",
            items: { type: "string" },
            description: "Names of family members this event involves (e.g. ['Jake', 'Emma']). Use names as the user refers to them.",
          },
          recurrence: {
            type: "string",
            enum: ["none", "daily", "weekly", "biweekly", "monthly"],
            description: "How often this repeats. 'none' for one-time events.",
          },
          description: {
            type: "string",
            description: "Additional notes about the event",
          },
        },
        required: ["title", "startTime"],
      },
    },
    {
      name: "assign_task",
      description:
        "Create a task or chore and optionally assign it to a family member. Use for to-dos, chores, errands, homework reminders, or anything that needs to get done.",
      input_schema: {
        type: "object" as const,
        properties: {
          title: {
            type: "string",
            description: "What needs to be done — concise (e.g. 'Sign permission slip', 'Buy birthday gift for party')",
          },
          assignedTo: {
            type: "string",
            description: "Name of the family member this is assigned to. Leave empty if unassigned.",
          },
          dueDate: {
            type: "string",
            description: "When this needs to be done by. Relative or ISO date.",
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "high: time-sensitive or important. medium: should get done. low: nice to do.",
          },
          category: {
            type: "string",
            enum: ["chore", "errand", "school", "health", "other"],
            description: "What kind of task this is",
          },
          recurrence: {
            type: "string",
            enum: ["none", "daily", "weekly", "biweekly", "monthly"],
            description: "Whether this repeats (e.g. weekly chore rotation)",
          },
          description: {
            type: "string",
            description: "Additional details about the task",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "add_to_shopping_list",
      description:
        "Add one or more items to the family's shopping list. Batch multiple items in one call when possible.",
      input_schema: {
        type: "object" as const,
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name" },
                quantity: { type: "string", description: "Amount needed, e.g. '2 lbs', '1 gallon', '6 pack'" },
                category: {
                  type: "string",
                  enum: ["produce", "dairy", "meat", "pantry", "frozen", "household", "other"],
                  description: "Grocery category for organization",
                },
              },
              required: ["name"],
            },
            description: "Items to add to the list",
          },
          listName: {
            type: "string",
            description: "Which list to add to (default: 'Groceries'). Can be 'Costco', 'Target', etc.",
          },
        },
        required: ["items"],
      },
    },
    {
      name: "set_family_reminder",
      description:
        "Set a reminder that will push a notification to the right family member at the right time. ONLY call this after the user has explicitly confirmed they want a reminder. NEVER call proactively when events are just mentioned. Specify WHO gets reminded and WHEN.",
      input_schema: {
        type: "object" as const,
        properties: {
          topic: {
            type: "string",
            description: "What to remind about — concise and clear",
          },
          targetMember: {
            type: "string",
            description: "Name of the family member who should be reminded. Use 'me' for the user themselves, or a name like 'Dad', 'Jake', etc.",
          },
          when: {
            type: "string",
            description:
              "When to send the reminder. Relative ('in 2 hours', 'tomorrow 9am', 'Wednesday night') or ISO datetime.",
          },
          context: {
            type: "string",
            description: "Why this needs following up — relevant background",
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "high: time-sensitive. medium: important. low: nice to remember.",
          },
        },
        required: ["topic", "targetMember", "when", "priority"],
      },
    },
    {
      name: "check_family_schedule",
      description:
        "Check the family calendar for a specific date or date range. Use this BEFORE adding events to check for conflicts, or when the user asks what's happening on a day/week.",
      input_schema: {
        type: "object" as const,
        properties: {
          date: {
            type: "string",
            description: "The date to check. Relative ('today', 'tomorrow', 'Saturday', 'next week') or ISO date.",
          },
          memberName: {
            type: "string",
            description: "Optional: filter to one family member's events only",
          },
        },
        required: ["date"],
      },
    },
  ];
}

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  switch (toolName) {
    case "remember_fact":
      return handleRememberFact(toolInput, ctx);
    case "recall_memory":
      return handleRecallMemory(toolInput, ctx);
    case "set_family_reminder":
      return handleSetFamilyReminder(toolInput, ctx);
    case "add_calendar_event":
      return handleAddCalendarEvent(toolInput, ctx);
    case "assign_task":
      return handleAssignTask(toolInput, ctx);
    case "add_to_shopping_list":
      return handleAddToShoppingList(toolInput, ctx);
    case "check_family_schedule":
      return handleCheckFamilySchedule(toolInput, ctx);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── Tool implementations ────────────────────────────────────────

async function handleRememberFact(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const fact: ExtractedFact = {
    content: input.content as string,
    category: input.category as MemoryCategory,
    importance: input.importance as number,
    confidence: 0.95,
    updateType: "new",
    entities: [],
    emotion: null,
    temporal: false,
    memoryType: "semantic",
    eventDate: null,
  };

  await storeExtractedFacts(ctx.userId, [fact], ctx.conversationId);
  return JSON.stringify({ saved: true, content: fact.content });
}

async function handleRecallMemory(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const query = input.query as string;
  const category = input.category as MemoryCategory | undefined;

  const facts = await retrieveRelevantFacts({
    userId: ctx.userId,
    query,
    limit: 5,
    categoryFilter: category,
  });

  if (facts.length === 0) {
    return JSON.stringify({ found: false, message: "No relevant memories found." });
  }

  return JSON.stringify({
    found: true,
    facts: facts.map((f) => ({
      content: f.content,
      category: f.category,
      relevance: Math.round(f.score * 100) / 100,
    })),
  });
}

async function handleSetFamilyReminder(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const topic = input.topic as string;
  const context = (input.context as string) || "";
  const priority = input.priority as "high" | "medium" | "low";
  const when = input.when as string | undefined;
  const targetMember = input.targetMember as string;

  if (when) {
    const remindAt = parseReminderTime(when, ctx.timezone);

    // Dedup: check if a pending reminder already exists within ±5 minutes
    const DEDUP_WINDOW_MS = 5 * 60_000;
    const existing = await db
      .select({ id: schema.reminders.id })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.userId, ctx.userId),
          eq(schema.reminders.status, "pending"),
          gte(schema.reminders.remindAt, new Date(remindAt.getTime() - DEDUP_WINDOW_MS)),
          lte(schema.reminders.remindAt, new Date(remindAt.getTime() + DEDUP_WINDOW_MS)),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return JSON.stringify({
        already_set: true,
        topic,
        existingReminderId: existing[0].id,
        message: "A reminder for this is already set.",
      });
    }

    // Store as a followup too
    await addFollowups(ctx.userId, [{ topic, context, priority }]);

    // Resolve target family member ID if we have a familyId
    let targetMemberId: string | undefined;
    if (ctx.familyId && targetMember && targetMember !== "me") {
      const members = await db
        .select({ id: schema.familyMembers.id, name: schema.familyMembers.name })
        .from(schema.familyMembers)
        .where(eq(schema.familyMembers.familyId, ctx.familyId));

      const match = members.find(
        (m) => m.name.toLowerCase() === targetMember.toLowerCase(),
      );
      if (match) targetMemberId = match.id;
    }

    const reminderId = await createReminder({
      userId: ctx.userId,
      title: topic,
      body: context,
      remindAt,
      timezone: ctx.timezone,
      conversationId: ctx.conversationId,
      source: "chat",
      familyId: ctx.familyId,
      targetMemberId,
      metadata: {
        priority,
        rawWhen: when,
        remindAtISO: remindAt.toISOString(),
        targetMember,
      },
    });

    return JSON.stringify({
      saved: true,
      topic,
      priority,
      reminderId,
      targetMember,
      scheduledFor: remindAt.toISOString(),
      pushNotification: true,
    });
  }

  // No time specified — just store as a followup
  await addFollowups(ctx.userId, [{ topic, context, priority }]);

  return JSON.stringify({
    saved: true,
    topic,
    priority,
    targetMember,
    pushNotification: false,
  });
}

async function handleAddCalendarEvent(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!ctx.familyId) {
    return JSON.stringify({ error: "No family set up yet. Complete onboarding first." });
  }

  const title = input.title as string;
  const startTimeRaw = input.startTime as string;
  const endTimeRaw = input.endTime as string | undefined;
  const allDay = (input.allDay as boolean) ?? false;
  const location = input.location as string | undefined;
  const recurrence = (input.recurrence as string) ?? "none";
  const description = input.description as string | undefined;
  const assignedToNames = (input.assignedTo as string[]) ?? [];

  // Parse start time
  const startTime = parseReminderTime(startTimeRaw, ctx.timezone);
  const endTime = endTimeRaw
    ? parseReminderTime(endTimeRaw, ctx.timezone)
    : new Date(startTime.getTime() + 60 * 60 * 1000); // default 1hr

  // Resolve family member names to IDs
  let assignedToIds: string[] = [];
  if (assignedToNames.length > 0) {
    const members = await db
      .select({ id: schema.familyMembers.id, name: schema.familyMembers.name })
      .from(schema.familyMembers)
      .where(eq(schema.familyMembers.familyId, ctx.familyId));

    assignedToIds = assignedToNames
      .map((name) => {
        const match = members.find(
          (m) => m.name.toLowerCase() === name.toLowerCase(),
        );
        return match?.id;
      })
      .filter(Boolean) as string[];
  }

  const [event] = await db
    .insert(schema.calendarEvents)
    .values({
      familyId: ctx.familyId,
      createdBy: ctx.userId,
      title,
      description: description ?? null,
      startTime,
      endTime,
      allDay,
      location: location ?? null,
      recurrence: recurrence as any,
      assignedTo: assignedToIds,
      sourceConversationId: ctx.conversationId,
    })
    .returning({ id: schema.calendarEvents.id });

  // Notify assigned family members about the new event
  if (assignedToIds.length > 0) {
    const dateStr = startTime.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeStr = allDay
      ? "all day"
      : startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    notifyFamilyMembers(
      assignedToIds,
      "New event added",
      `${title} — ${dateStr} at ${timeStr}`,
      { type: "calendar_event", eventId: event.id },
    ).catch((err) =>
      console.warn("[tools/add_calendar_event] Push notification failed:", err),
    );
  }

  return JSON.stringify({
    created: true,
    eventId: event.id,
    title,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    assignedTo: assignedToNames,
    recurrence,
  });
}

async function handleAssignTask(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!ctx.familyId) {
    return JSON.stringify({ error: "No family set up yet. Complete onboarding first." });
  }

  const title = input.title as string;
  const assignedToName = input.assignedTo as string | undefined;
  const dueDateRaw = input.dueDate as string | undefined;
  const priority = (input.priority as string) ?? "medium";
  const category = input.category as string | undefined;
  const recurrence = (input.recurrence as string) ?? "none";
  const description = input.description as string | undefined;

  // Resolve family member
  let assignedToId: string | undefined;
  if (assignedToName) {
    const members = await db
      .select({ id: schema.familyMembers.id, name: schema.familyMembers.name })
      .from(schema.familyMembers)
      .where(eq(schema.familyMembers.familyId, ctx.familyId));

    const match = members.find(
      (m) => m.name.toLowerCase() === assignedToName.toLowerCase(),
    );
    if (match) assignedToId = match.id;
  }

  const dueDate = dueDateRaw ? parseReminderTime(dueDateRaw, ctx.timezone) : null;

  const [task] = await db
    .insert(schema.tasks)
    .values({
      familyId: ctx.familyId,
      createdBy: ctx.userId,
      title,
      description: description ?? null,
      assignedTo: assignedToId ?? null,
      dueDate,
      priority,
      category: category ?? null,
      recurrence: recurrence as any,
      sourceConversationId: ctx.conversationId,
    })
    .returning({ id: schema.tasks.id });

  // Notify the assigned family member
  if (assignedToId) {
    const creatorName = await db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, ctx.userId))
      .then((rows) => rows[0]?.name ?? "Someone");

    notifyFamilyMembers(
      [assignedToId],
      "New task assigned",
      `${creatorName} assigned you: ${title}`,
      { type: "task_assigned", taskId: task.id },
    ).catch((err) =>
      console.warn("[tools/assign_task] Push notification failed:", err),
    );
  }

  return JSON.stringify({
    created: true,
    taskId: task.id,
    title,
    assignedTo: assignedToName ?? null,
    dueDate: dueDate?.toISOString() ?? null,
    priority,
  });
}

async function handleAddToShoppingList(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!ctx.familyId) {
    return JSON.stringify({ error: "No family set up yet. Complete onboarding first." });
  }

  const items = input.items as { name: string; quantity?: string; category?: string }[];
  const listName = (input.listName as string) ?? "Groceries";

  // Find or create the shopping list
  let list = await db
    .select({ id: schema.shoppingLists.id })
    .from(schema.shoppingLists)
    .where(
      and(
        eq(schema.shoppingLists.familyId, ctx.familyId),
        eq(schema.shoppingLists.name, listName),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!list) {
    [list] = await db
      .insert(schema.shoppingLists)
      .values({
        familyId: ctx.familyId,
        name: listName,
        createdBy: ctx.userId,
      })
      .returning({ id: schema.shoppingLists.id });
  }

  // Insert all items
  const insertedItems = await db
    .insert(schema.shoppingListItems)
    .values(
      items.map((item) => ({
        listId: list.id,
        name: item.name,
        quantity: item.quantity ?? null,
        category: item.category ?? null,
        addedBy: ctx.userId,
        sourceConversationId: ctx.conversationId,
      })),
    )
    .returning({ id: schema.shoppingListItems.id, name: schema.shoppingListItems.name });

  return JSON.stringify({
    added: true,
    listName,
    items: insertedItems.map((i) => i.name),
    count: insertedItems.length,
  });
}

async function handleCheckFamilySchedule(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!ctx.familyId) {
    return JSON.stringify({ error: "No family set up yet. Complete onboarding first." });
  }

  const dateRaw = input.date as string;
  const memberName = input.memberName as string | undefined;

  // Parse the date to get a day range
  const targetDate = parseReminderTime(dateRaw, ctx.timezone);
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const events = await db
    .select()
    .from(schema.calendarEvents)
    .where(
      and(
        eq(schema.calendarEvents.familyId, ctx.familyId),
        gte(schema.calendarEvents.startTime, dayStart),
        lte(schema.calendarEvents.startTime, dayEnd),
        isNull(schema.calendarEvents.completedAt),
      ),
    )
    .orderBy(schema.calendarEvents.startTime);

  // Also get tasks due that day
  const tasksDue = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.familyId, ctx.familyId),
        gte(schema.tasks.dueDate, dayStart),
        lte(schema.tasks.dueDate, dayEnd),
        isNull(schema.tasks.completedAt),
      ),
    );

  // Resolve member names
  const members = await db
    .select({ id: schema.familyMembers.id, name: schema.familyMembers.name })
    .from(schema.familyMembers)
    .where(eq(schema.familyMembers.familyId, ctx.familyId));

  const memberMap = new Map(members.map((m) => [m.id, m.name]));

  const formattedEvents = events.map((e) => ({
    title: e.title,
    time: e.startTime?.toISOString(),
    endTime: e.endTime?.toISOString(),
    location: e.location,
    assignedTo: (e.assignedTo as string[])?.map((id) => memberMap.get(id) ?? "Unknown") ?? [],
    allDay: e.allDay,
  }));

  const formattedTasks = tasksDue.map((t) => ({
    title: t.title,
    priority: t.priority,
    assignedTo: t.assignedTo ? memberMap.get(t.assignedTo) ?? "Unassigned" : "Unassigned",
  }));

  // Filter by member name if specified
  if (memberName) {
    const filtered = formattedEvents.filter((e) =>
      e.assignedTo.some((n) => n.toLowerCase() === memberName.toLowerCase()),
    );
    return JSON.stringify({
      date: dayStart.toISOString().split("T")[0],
      memberFilter: memberName,
      events: filtered,
      tasks: formattedTasks.filter(
        (t) => t.assignedTo.toLowerCase() === memberName.toLowerCase(),
      ),
    });
  }

  return JSON.stringify({
    date: dayStart.toISOString().split("T")[0],
    events: formattedEvents,
    tasks: formattedTasks,
    conflicts: detectConflicts(formattedEvents),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────

function detectConflicts(
  events: { title: string; time?: string; endTime?: string; allDay: boolean }[],
): string[] {
  const conflicts: string[] = [];
  const timedEvents = events.filter((e) => !e.allDay && e.time && e.endTime);

  for (let i = 0; i < timedEvents.length; i++) {
    for (let j = i + 1; j < timedEvents.length; j++) {
      const a = timedEvents[i];
      const b = timedEvents[j];
      const aStart = new Date(a.time!).getTime();
      const aEnd = new Date(a.endTime!).getTime();
      const bStart = new Date(b.time!).getTime();
      const bEnd = new Date(b.endTime!).getTime();

      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push(`"${a.title}" overlaps with "${b.title}"`);
      }
    }
  }
  return conflicts;
}
