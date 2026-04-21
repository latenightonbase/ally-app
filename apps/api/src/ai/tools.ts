import { retrieveRelevantFacts } from "../services/retrieval";
import { storeExtractedFacts, addFollowups } from "../services/memory";
import { createReminder, parseReminderTime } from "../services/reminderService";
import { notifyFamilyMembers } from "../services/notificationRouter";
import { db, schema } from "../db";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
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
            type: "array",
            items: { type: "string" },
            description: "Names of family members this is assigned to. Empty or omitted if unassigned. Use an array even for a single person (e.g. [\"John\"]).",
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
        "Send a push notification to a family member at a specific time. This only sends a ping — it does NOT create a visible task. When the user says 'remind [name] to [do something]', also call assign_task so the person sees it in their task list. ONLY call this after the user has explicitly confirmed they want a reminder.",
      input_schema: {
        type: "object" as const,
        properties: {
          topic: {
            type: "string",
            description: "What to remind about — concise and clear",
          },
          targetMember: {
            type: "string",
            description: "Deprecated: prefer `targetMembers`. Name of a single family member, or 'me' for the user themselves.",
          },
          targetMembers: {
            type: "array",
            items: { type: "string" },
            description: "Names of the family members who should be reminded (e.g. ['Dad', 'Jake']). Use this to ping multiple people at once. Use 'me' for the user themselves.",
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
        required: ["topic", "when", "priority"],
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
    {
      name: "list_family_reminders",
      description:
        "List pending reminders for the family. Use when the user asks what reminders are active, when planning proactive check-ins, or before creating a reminder to avoid duplicates. Read-only.",
      input_schema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["pending", "sent", "dismissed", "all"],
            description: "Filter by status. Defaults to 'pending'.",
          },
          memberName: {
            type: "string",
            description: "Optional: only reminders targeting this member's name.",
          },
          within: {
            type: "string",
            enum: ["24h", "48h", "7d", "30d", "all"],
            description: "Time window for remindAt. Defaults to 7d.",
          },
          limit: {
            type: "number",
            description: "Max rows to return (default 20, max 50).",
          },
        },
        required: [],
      },
    },
    {
      name: "list_family_tasks",
      description:
        "List family tasks. Use when the user asks what's on the to-do list, who's responsible for what, or when deciding whether to ping someone about an outstanding item. Read-only.",
      input_schema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed", "all"],
            description: "Filter by task status. Defaults to 'pending'+'in_progress'.",
          },
          memberName: {
            type: "string",
            description: "Optional: only tasks assigned to this family member.",
          },
          dueWithin: {
            type: "string",
            enum: ["today", "48h", "7d", "overdue", "all"],
            description: "Time window for dueDate. Defaults to '7d'.",
          },
          limit: {
            type: "number",
            description: "Max rows to return (default 25, max 100).",
          },
        },
        required: [],
      },
    },
    {
      name: "list_shopping_items",
      description:
        "List items on the family's shopping lists. Use when the user asks what's on the list, when planning a grocery run, or when deciding whether to remind someone to pick up an item. Read-only.",
      input_schema: {
        type: "object" as const,
        properties: {
          listName: {
            type: "string",
            description: "Optional: filter to one list (e.g. 'Groceries', 'Costco').",
          },
          includeChecked: {
            type: "boolean",
            description: "Include already-checked items. Defaults to false.",
          },
          limit: {
            type: "number",
            description: "Max items per list (default 30, max 100).",
          },
        },
        required: [],
      },
    },
    {
      name: "list_family_events",
      description:
        "List upcoming family calendar events in a time window. Use to plan around conflicts, anticipate commitments, or decide when to ping family members. Read-only.",
      input_schema: {
        type: "object" as const,
        properties: {
          memberName: {
            type: "string",
            description: "Optional: only events involving this family member.",
          },
          within: {
            type: "string",
            enum: ["24h", "48h", "7d", "30d"],
            description: "Time window starting now. Defaults to '7d'.",
          },
          limit: {
            type: "number",
            description: "Max rows to return (default 20, max 50).",
          },
        },
        required: [],
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
    case "list_family_reminders":
      return handleListFamilyReminders(toolInput, ctx);
    case "list_family_tasks":
      return handleListFamilyTasks(toolInput, ctx);
    case "list_shopping_items":
      return handleListShoppingItems(toolInput, ctx);
    case "list_family_events":
      return handleListFamilyEvents(toolInput, ctx);
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
  const targetMemberRaw = input.targetMember as string | undefined;
  const targetMembersRaw = input.targetMembers as string[] | undefined;

  const requestedNames = (() => {
    const names: string[] = [];
    if (Array.isArray(targetMembersRaw)) {
      for (const n of targetMembersRaw) {
        if (typeof n === "string" && n.trim()) names.push(n.trim());
      }
    }
    if (targetMemberRaw && targetMemberRaw.trim()) {
      names.push(targetMemberRaw.trim());
    }
    return Array.from(new Set(names));
  })();

  const targetMemberLabel =
    requestedNames.length > 0 ? requestedNames.join(", ") : "me";

  if (when) {
    const remindAt = parseReminderTime(when, ctx.timezone);

    // Dedup: check if a pending reminder with a similar title already exists for this user.
    // This catches the common pattern where the AI sets a reminder on the user's first message
    // and then sets another one after the user confirms the time — the titles match, times differ.
    const pendingReminders = await db
      .select({ id: schema.reminders.id, title: schema.reminders.title })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.userId, ctx.userId),
          eq(schema.reminders.status, "pending"),
        ),
      )
      .limit(50);

    const similarExisting = pendingReminders.find((r) => {
      const existingTokens = new Set(r.title.toLowerCase().split(/\W+/).filter(Boolean));
      const newTokens = new Set(topic.toLowerCase().split(/\W+/).filter(Boolean));
      const intersection = [...existingTokens].filter((t) => newTokens.has(t)).length;
      const union = new Set([...existingTokens, ...newTokens]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      return jaccard >= 0.5;
    });

    if (similarExisting) {
      // Update the existing reminder's time instead of creating a duplicate
      const { updateReminderTime } = await import("../services/reminderService");
      await updateReminderTime(similarExisting.id, remindAt);
      return JSON.stringify({
        updated: true,
        topic,
        reminderId: similarExisting.id,
        scheduledFor: remindAt.toISOString(),
        message: "Updated existing reminder to new time.",
      });
    }

    // Store as a followup too
    await addFollowups(ctx.userId, [{ topic, context, priority }]);

    let targetMemberIds: string[] = [];
    if (ctx.familyId && requestedNames.length > 0) {
      const members = await db
        .select({ id: schema.familyMembers.id, name: schema.familyMembers.name })
        .from(schema.familyMembers)
        .where(eq(schema.familyMembers.familyId, ctx.familyId));

      const memberByName = new Map(
        members.map((m) => [m.name.toLowerCase(), m.id]),
      );

      for (const name of requestedNames) {
        if (name.toLowerCase() === "me") continue;
        const id = memberByName.get(name.toLowerCase());
        if (id && !targetMemberIds.includes(id)) targetMemberIds.push(id);
      }
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
      targetMemberIds,
      metadata: {
        priority,
        rawWhen: when,
        remindAtISO: remindAt.toISOString(),
        targetMember: targetMemberLabel,
        targetMembers: requestedNames,
      },
    });

    return JSON.stringify({
      saved: true,
      topic,
      priority,
      reminderId,
      targetMember: targetMemberLabel,
      targetMembers: requestedNames,
      scheduledFor: remindAt.toISOString(),
      pushNotification: true,
    });
  }

  await addFollowups(ctx.userId, [{ topic, context, priority }]);

  return JSON.stringify({
    saved: true,
    topic,
    priority,
    targetMember: targetMemberLabel,
    targetMembers: requestedNames,
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
  const rawAssignees = input.assignedTo;
  const assignedToNames: string[] = Array.isArray(rawAssignees)
    ? (rawAssignees as string[])
    : typeof rawAssignees === "string" && rawAssignees.length > 0
      ? [rawAssignees]
      : [];
  const dueDateRaw = input.dueDate as string | undefined;
  const priority = (input.priority as string) ?? "medium";
  const category = input.category as string | undefined;
  const recurrence = (input.recurrence as string) ?? "none";
  const description = input.description as string | undefined;

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
      .filter((id): id is string => Boolean(id));
  }

  const dueDate = dueDateRaw ? parseReminderTime(dueDateRaw, ctx.timezone) : null;

  // ── Duplicate check (Jaccard similarity ≥ 0.8) ──
  const existingTasks = await db
    .select({ id: schema.tasks.id, title: schema.tasks.title, dueDate: schema.tasks.dueDate, category: schema.tasks.category })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.familyId, ctx.familyId),
        eq(schema.tasks.status, "pending"),
      ),
    );

  const newTokens = new Set(title.toLowerCase().split(/\s+/).filter(Boolean));
  for (const existing of existingTasks) {
    // Check category match (if both have one)
    if (category && existing.category && category !== existing.category) continue;
    // Check dueDate proximity (±30 min) when both have dates
    if (dueDate && existing.dueDate) {
      const diff = Math.abs(dueDate.getTime() - existing.dueDate.getTime());
      if (diff > 30 * 60 * 1000) continue;
    } else if ((dueDate == null) !== (existing.dueDate == null)) {
      // One has date, other doesn't — still compare by title alone
    }
    // Jaccard similarity on title
    const existingTokens = new Set(existing.title.toLowerCase().split(/\s+/).filter(Boolean));
    const intersection = [...newTokens].filter((t) => existingTokens.has(t)).length;
    const union = new Set([...newTokens, ...existingTokens]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    if (jaccard >= 0.8) {
      return JSON.stringify({
        skipped: true,
        reason: `A similar task already exists: "${existing.title}"`,
        existingTaskId: existing.id,
      });
    }
  }

  const [task] = await db
    .insert(schema.tasks)
    .values({
      familyId: ctx.familyId,
      createdBy: ctx.userId,
      title,
      description: description ?? null,
      assignedTo: assignedToIds,
      dueDate,
      priority,
      category: category ?? null,
      recurrence: recurrence as any,
      sourceConversationId: ctx.conversationId,
    })
    .returning({ id: schema.tasks.id });

  if (assignedToIds.length > 0) {
    const creatorName = await db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, ctx.userId))
      .then((rows) => rows[0]?.name ?? "Someone");

    notifyFamilyMembers(
      assignedToIds,
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
    assignedTo: assignedToNames,
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

  const formattedTasks = tasksDue.map((t) => {
    const ids = Array.isArray(t.assignedTo) ? (t.assignedTo as string[]) : [];
    return {
      title: t.title,
      priority: t.priority,
      assignedTo:
        ids.length > 0
          ? ids.map((id) => memberMap.get(id) ?? "Unknown")
          : ["Unassigned"],
    };
  });

  // Filter by member name if specified
  if (memberName) {
    const lowered = memberName.toLowerCase();
    const filtered = formattedEvents.filter((e) =>
      e.assignedTo.some((n) => n.toLowerCase() === lowered),
    );
    return JSON.stringify({
      date: dayStart.toISOString().split("T")[0],
      memberFilter: memberName,
      events: filtered,
      tasks: formattedTasks.filter((t) =>
        t.assignedTo.some((n) => n.toLowerCase() === lowered),
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

// ─── Read tools ──────────────────────────────────────────────────

function resolveWithinMs(value: string | undefined, fallback: string): number {
  const v = value ?? fallback;
  switch (v) {
    case "24h":
      return 24 * 3600 * 1000;
    case "48h":
      return 48 * 3600 * 1000;
    case "7d":
      return 7 * 24 * 3600 * 1000;
    case "30d":
      return 30 * 24 * 3600 * 1000;
    default:
      return 7 * 24 * 3600 * 1000;
  }
}

async function getFamilyMemberMap(familyId: string) {
  const members = await db
    .select({ id: schema.familyMembers.id, name: schema.familyMembers.name })
    .from(schema.familyMembers)
    .where(eq(schema.familyMembers.familyId, familyId));
  const byId = new Map(members.map((m) => [m.id, m.name]));
  const byName = new Map(members.map((m) => [m.name.toLowerCase(), m.id]));
  return { byId, byName, members };
}

async function handleListFamilyReminders(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const status = (input.status as string | undefined) ?? "pending";
  const within = input.within as string | undefined;
  const memberName = input.memberName as string | undefined;
  const limit = Math.min(
    Math.max(Number(input.limit ?? 20) || 20, 1),
    50,
  );

  const now = new Date();
  const windowMs = within === "all" ? null : resolveWithinMs(within, "7d");
  const end = windowMs ? new Date(now.getTime() + windowMs) : null;

  const conds: ReturnType<typeof and>[] = [
    eq(schema.reminders.userId, ctx.userId),
  ];
  if (status !== "all") {
    conds.push(
      eq(
        schema.reminders.status,
        status as "pending" | "sent" | "dismissed",
      ),
    );
  }
  if (end) {
    conds.push(gte(schema.reminders.remindAt, now));
    conds.push(lte(schema.reminders.remindAt, end));
  }

  const rows = await db
    .select()
    .from(schema.reminders)
    .where(and(...conds))
    .orderBy(asc(schema.reminders.remindAt))
    .limit(limit);

  let memberById = new Map<string, string>();
  let memberByName = new Map<string, string>();
  if (ctx.familyId) {
    const maps = await getFamilyMemberMap(ctx.familyId);
    memberById = maps.byId;
    memberByName = maps.byName;
  }

  const filterMemberId = memberName
    ? memberByName.get(memberName.toLowerCase())
    : undefined;

  const reminders = rows
    .filter((r) => {
      if (!memberName) return true;
      if (!filterMemberId) return false;
      const ids = (r.targetMemberIds as string[] | null) ?? [];
      return ids.includes(filterMemberId);
    })
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      remindAt: r.remindAt.toISOString(),
      status: r.status,
      source: r.source,
      targetMembers: ((r.targetMemberIds as string[] | null) ?? []).map(
        (id) => memberById.get(id) ?? "Unknown",
      ),
    }));

  return JSON.stringify({
    count: reminders.length,
    reminders,
  });
}

async function handleListFamilyTasks(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!ctx.familyId) {
    return JSON.stringify({
      error: "No family set up yet. Complete onboarding first.",
    });
  }

  const statusFilter = (input.status as string | undefined) ?? "open";
  const dueWithin = (input.dueWithin as string | undefined) ?? "7d";
  const memberName = input.memberName as string | undefined;
  const limit = Math.min(
    Math.max(Number(input.limit ?? 25) || 25, 1),
    100,
  );

  const now = new Date();
  const conds: ReturnType<typeof and>[] = [
    eq(schema.tasks.familyId, ctx.familyId),
  ];

  if (statusFilter === "pending") {
    conds.push(eq(schema.tasks.status, "pending"));
  } else if (statusFilter === "in_progress") {
    conds.push(eq(schema.tasks.status, "in_progress"));
  } else if (statusFilter === "completed") {
    conds.push(eq(schema.tasks.status, "completed"));
  } else if (statusFilter === "open" || statusFilter === undefined) {
    conds.push(
      or(
        eq(schema.tasks.status, "pending"),
        eq(schema.tasks.status, "in_progress"),
      )!,
    );
  }

  if (dueWithin === "today") {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    conds.push(gte(schema.tasks.dueDate, dayStart));
    conds.push(lte(schema.tasks.dueDate, dayEnd));
  } else if (dueWithin === "overdue") {
    conds.push(lte(schema.tasks.dueDate, now));
    conds.push(isNull(schema.tasks.completedAt));
  } else if (dueWithin !== "all") {
    const end = new Date(now.getTime() + resolveWithinMs(dueWithin, "7d"));
    conds.push(
      or(
        isNull(schema.tasks.dueDate),
        and(
          gte(schema.tasks.dueDate, now),
          lte(schema.tasks.dueDate, end),
        )!,
      )!,
    );
  }

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(...conds))
    .orderBy(asc(schema.tasks.dueDate))
    .limit(limit);

  const { byId: memberById, byName: memberByName } = await getFamilyMemberMap(
    ctx.familyId,
  );

  const filterMemberId = memberName
    ? memberByName.get(memberName.toLowerCase())
    : undefined;

  const tasks = rows
    .filter((t) => {
      if (!memberName) return true;
      if (!filterMemberId) return false;
      const ids = Array.isArray(t.assignedTo) ? (t.assignedTo as string[]) : [];
      return ids.includes(filterMemberId);
    })
    .map((t) => {
      const ids = Array.isArray(t.assignedTo) ? (t.assignedTo as string[]) : [];
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate?.toISOString() ?? null,
        assignedTo:
          ids.length > 0
            ? ids.map((id) => memberById.get(id) ?? "Unknown")
            : [],
      };
    });

  return JSON.stringify({
    count: tasks.length,
    tasks,
  });
}

async function handleListShoppingItems(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!ctx.familyId) {
    return JSON.stringify({
      error: "No family set up yet. Complete onboarding first.",
    });
  }

  const listNameFilter = input.listName as string | undefined;
  const includeChecked = Boolean(input.includeChecked);
  const limit = Math.min(
    Math.max(Number(input.limit ?? 30) || 30, 1),
    100,
  );

  const lists = await db
    .select()
    .from(schema.shoppingLists)
    .where(eq(schema.shoppingLists.familyId, ctx.familyId));

  const filtered = listNameFilter
    ? lists.filter(
        (l) => l.name.toLowerCase() === listNameFilter.toLowerCase(),
      )
    : lists;

  if (filtered.length === 0) {
    return JSON.stringify({ count: 0, lists: [] });
  }

  const listIds = filtered.map((l) => l.id);
  const itemConds: ReturnType<typeof and>[] = [
    inArray(schema.shoppingListItems.listId, listIds),
  ];
  if (!includeChecked) {
    itemConds.push(eq(schema.shoppingListItems.checked, false));
  }

  const items = await db
    .select()
    .from(schema.shoppingListItems)
    .where(and(...itemConds))
    .orderBy(asc(schema.shoppingListItems.createdAt));

  const grouped = filtered.map((l) => {
    const listItems = items
      .filter((i) => i.listId === l.id)
      .slice(0, limit)
      .map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        category: i.category,
        checked: i.checked,
      }));
    return {
      listId: l.id,
      listName: l.name,
      itemCount: listItems.length,
      items: listItems,
    };
  });

  return JSON.stringify({
    count: grouped.reduce((sum, g) => sum + g.itemCount, 0),
    lists: grouped,
  });
}

async function handleListFamilyEvents(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!ctx.familyId) {
    return JSON.stringify({
      error: "No family set up yet. Complete onboarding first.",
    });
  }

  const within = input.within as string | undefined;
  const memberName = input.memberName as string | undefined;
  const limit = Math.min(
    Math.max(Number(input.limit ?? 20) || 20, 1),
    50,
  );

  const now = new Date();
  const end = new Date(now.getTime() + resolveWithinMs(within, "7d"));

  const rows = await db
    .select()
    .from(schema.calendarEvents)
    .where(
      and(
        eq(schema.calendarEvents.familyId, ctx.familyId),
        gte(schema.calendarEvents.startTime, now),
        lte(schema.calendarEvents.startTime, end),
        isNull(schema.calendarEvents.completedAt),
      ),
    )
    .orderBy(asc(schema.calendarEvents.startTime))
    .limit(limit);

  const { byId: memberById, byName: memberByName } = await getFamilyMemberMap(
    ctx.familyId,
  );

  const filterMemberId = memberName
    ? memberByName.get(memberName.toLowerCase())
    : undefined;

  const events = rows
    .filter((e) => {
      if (!memberName) return true;
      if (!filterMemberId) return false;
      const ids = Array.isArray(e.assignedTo) ? (e.assignedTo as string[]) : [];
      return ids.includes(filterMemberId);
    })
    .map((e) => {
      const ids = Array.isArray(e.assignedTo) ? (e.assignedTo as string[]) : [];
      return {
        id: e.id,
        title: e.title,
        description: e.description,
        startTime: e.startTime?.toISOString(),
        endTime: e.endTime?.toISOString(),
        location: e.location,
        allDay: e.allDay,
        assignedTo: ids.map((id) => memberById.get(id) ?? "Unknown"),
      };
    });

  return JSON.stringify({
    count: events.length,
    events,
  });
}

// quiet unused import warnings when proactive handlers aren't added here
void sql;
