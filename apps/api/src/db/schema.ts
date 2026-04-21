import {
  pgTable,
  uuid,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
  pgEnum,
  date,
} from "drizzle-orm/pg-core";
import type { MemoryProfile } from "@ally/shared";
import { user } from "./auth-schema";

export { user, session, account, verification } from "./auth-schema";

export const tierEnum = pgEnum("tier", [
  "free_trial",
  "basic",
  "premium",
]);

export const familyRoleEnum = pgEnum("family_role", ["admin", "member"]);

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "skipped",
]);

export const taskRecurrenceEnum = pgEnum("task_recurrence", [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
]);

// ─── Family tables ───────────────────────────────────────────────

export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").unique(),
  artworkId: text("artwork_id"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  timezone: text("timezone").default("America/New_York"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Family members who don't have their own app account (e.g. kids).
 * They still get reminders (via parent relay or push to a linked device).
 */
export const familyMembers = pgTable(
  "family_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    /** If linked to an actual user account */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    role: text("role").default("child"), // "parent" | "child" | "other"
    age: integer("age"),
    birthday: text("birthday"), // ISO date string
    school: text("school"),
    allergies: jsonb("allergies").$type<string[]>().default([]),
    dietaryPreferences: jsonb("dietary_preferences").$type<string[]>().default([]),
    notes: text("notes"),
    color: text("color").default("#4F46E5"), // UI color for calendar
    expoPushToken: text("expo_push_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    familyIdx: index("family_members_family_idx").on(table.familyId),
    userIdx: index("family_members_user_idx").on(table.userId),
  }),
);

export const familyInvites = pgTable(
  "family_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: familyRoleEnum("role").notNull().default("member"),
    status: inviteStatusEnum("status").notNull().default("pending"),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    familyIdx: index("family_invites_family_idx").on(table.familyId),
    emailIdx: index("family_invites_email_idx").on(table.email),
    tokenIdx: uniqueIndex("family_invites_token_idx").on(table.token),
  }),
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    recurrence: taskRecurrenceEnum("recurrence").notNull().default("none"),
    /** Which family member(s) this event is for */
    assignedTo: jsonb("assigned_to").$type<string[]>().notNull().default([]),
    /** Auto-generated reminder config */
    remindBefore: integer("remind_before").default(30), // minutes
    color: text("color"),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
    ),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    familyIdx: index("calendar_events_family_idx").on(table.familyId),
    familyTimeIdx: index("calendar_events_family_time_idx").on(
      table.familyId,
      table.startTime,
    ),
    createdByIdx: index("calendar_events_created_by_idx").on(table.createdBy),
  }),
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Family member ID this is assigned to */
    assignedTo: uuid("assigned_to").references(() => familyMembers.id, {
      onDelete: "set null",
    }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: taskStatusEnum("status").notNull().default("pending"),
    recurrence: taskRecurrenceEnum("recurrence").notNull().default("none"),
    priority: text("priority").default("medium"), // "high" | "medium" | "low"
    category: text("category"), // "chore" | "errand" | "school" | "health" | "other"
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
    ),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    familyIdx: index("tasks_family_idx").on(table.familyId),
    assignedIdx: index("tasks_assigned_idx").on(table.assignedTo),
    familyStatusIdx: index("tasks_family_status_idx").on(
      table.familyId,
      table.status,
    ),
  }),
);

export const shoppingLists = pgTable(
  "shopping_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Groceries"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    familyIdx: index("shopping_lists_family_idx").on(table.familyId),
  }),
);

export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: text("quantity"),
    category: text("category"), // "produce" | "dairy" | "meat" | "pantry" | "frozen" | "other"
    checked: boolean("checked").notNull().default(false),
    addedBy: text("added_by").references(() => user.id),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    listIdx: index("shopping_list_items_list_idx").on(table.listId),
    listCheckedIdx: index("shopping_list_items_list_checked_idx").on(
      table.listId,
      table.checked,
    ),
  }),
);

// ─── Meal planning ───────────────────────────────────────────────

export const mealPlans = pgTable(
  "meal_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    mealType: text("meal_type").notNull(), // "breakfast" | "lunch" | "dinner" | "snack"
    title: text("title").notNull(),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    familyDateIdx: index("meal_plans_family_date_idx").on(
      table.familyId,
      table.date,
    ),
  }),
);

export const messageRoleEnum = pgEnum("message_role", ["user", "ally"]);

export const memoryCategoryEnum = pgEnum("memory_category", [
  "personal_info",
  "relationships",
  "work",
  "health",
  "interests",
  "goals",
  "emotional_patterns",
  "school",
  "activities",
  "dietary",
  "family_routines",
]);

export const memorySourceTypeEnum = pgEnum("memory_source_type", [
  "chat",
  "calendar",
  "notes",
  "health",
]);

export const entityTypeEnum = pgEnum("entity_type", [
  "person",
  "place",
  "org",
  "topic",
  "goal",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    preview: text("preview"),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("conversations_user_idx").on(table.userId),
    userLastMsgIdx: index("conversations_user_last_msg_idx").on(
      table.userId,
      table.lastMessageAt,
    ),
  }),
);

export const sessions = pgTable(
  "sessions_v2",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    summary: text("summary"),
    messageCount: integer("message_count").notNull().default(0),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => ({
    convIdx: index("sessions_v2_conv_idx").on(table.conversationId),
    userIdx: index("sessions_v2_user_idx").on(table.userId),
    userTimeIdx: index("sessions_v2_user_time_idx").on(table.userId, table.startedAt),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    feedback: integer("feedback"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_idx").on(table.conversationId),
    conversationTimeIdx: index("messages_conversation_time_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    sessionIdx: index("messages_session_idx").on(table.sessionId),
  }),
);

export const memoryProfiles = pgTable("memory_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  profile: jsonb("profile").$type<MemoryProfile>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memoryFacts = pgTable(
  "memory_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    category: memoryCategoryEnum("category").notNull(),
    importance: real("importance").notNull().default(0.5),
    confidence: real("confidence").notNull().default(0.8),
    temporal: boolean("temporal").notNull().default(false),
    entities: jsonb("entities").$type<string[]>().notNull().default([]),
    emotion: text("emotion"),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
    ),
    sourceDate: timestamp("source_date", { withTimezone: true }).defaultNow().notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    supersededBy: uuid("superseded_by"),
    consolidatedFrom: jsonb("consolidated_from").$type<string[]>().notNull().default([]),
    sourceType: memorySourceTypeEnum("source_type").notNull().default("chat"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("memory_facts_user_idx").on(table.userId),
    userCategoryIdx: index("memory_facts_user_category_idx").on(
      table.userId,
      table.category,
    ),
  }),
);

export const memoryEpisodes = pgTable(
  "memory_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    category: memoryCategoryEnum("category").notNull(),
    emotion: text("emotion"),
    entities: jsonb("entities").$type<string[]>().notNull().default([]),
    importance: real("importance").notNull().default(0.5),
    confidence: real("confidence").notNull().default(0.8),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consolidatedAt: timestamp("consolidated_at", { withTimezone: true }),
    consolidatedIntoFactId: uuid("consolidated_into_fact_id"),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
    ),
    sourceType: memorySourceTypeEnum("source_type").notNull().default("chat"),
    sourceDate: timestamp("source_date", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("memory_episodes_user_idx").on(table.userId),
    expiresIdx: index("memory_episodes_expires_idx").on(table.userId, table.expiresAt),
    unconsolidatedIdx: index("memory_episodes_unconsolidated_idx").on(
      table.userId,
      table.consolidatedAt,
    ),
  }),
);

export const memoryEvents = pgTable(
  "memory_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    eventDate: timestamp("event_date", { withTimezone: true }).notNull(),
    context: text("context"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    followedUpAt: timestamp("followed_up_at", { withTimezone: true }),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
    ),
    sourceType: memorySourceTypeEnum("source_type").notNull().default("chat"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("memory_events_user_idx").on(table.userId),
    upcomingIdx: index("memory_events_upcoming_idx").on(
      table.userId,
      table.eventDate,
      table.completedAt,
    ),
  }),
);

export const briefings = pgTable(
  "briefings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    content: text("content").notNull(),
    delivered: boolean("delivered").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: uniqueIndex("briefings_user_date_idx").on(
      table.userId,
      table.date,
    ),
  }),
);

export const weeklyInsights = pgTable(
  "weekly_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekOf: text("week_of").notNull(),
    summary: text("summary").notNull(),
    moodTrend: text("mood_trend").notNull(),
    topThemes: jsonb("top_themes").$type<string[]>().notNull().default([]),
    followUpSuggestions: jsonb("follow_up_suggestions")
      .$type<string[]>()
      .notNull()
      .default([]),
    delivered: boolean("delivered").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userWeekIdx: uniqueIndex("weekly_insights_user_week_idx").on(
      table.userId,
      table.weekOf,
    ),
    userCreatedIdx: index("weekly_insights_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export const reminderStatusEnum = pgEnum("reminder_status", [
  "pending",
  "sent",
  "dismissed",
]);

export const reminderSourceEnum = pgEnum("reminder_source", [
  "chat",
  "extraction",
  "onboarding",
  "system",
]);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    /** Which family member this reminder targets */
    targetMemberId: uuid("target_member_id").references(() => familyMembers.id, {
      onDelete: "set null",
    }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body"),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    timezone: text("timezone"),
    source: reminderSourceEnum("source").notNull().default("chat"),
    status: reminderStatusEnum("status").notNull().default("pending"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("reminders_user_idx").on(table.userId),
    pendingIdx: index("reminders_pending_idx").on(table.status, table.remindAt),
    userPendingIdx: index("reminders_user_pending_idx").on(
      table.userId,
      table.status,
      table.remindAt,
    ),
  }),
);

export const checkinTypeEnum = pgEnum("checkin_type", [
  "casual",
  "event_followup",
  "goal_checkin",
  "context_aware",
]);

export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    type: checkinTypeEnum("type").notNull().default("casual"),
    content: text("content").notNull(),
    eventId: uuid("event_id").references(() => memoryEvents.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).defaultNow().notNull(),
    pushSent: boolean("push_sent").notNull().default(false),
  },
  (table) => ({
    userIdx: index("checkins_user_idx").on(table.userId),
    userDeliveredIdx: index("checkins_user_delivered_idx").on(
      table.userId,
      table.deliveredAt,
    ),
    userTypeIdx: index("checkins_user_type_idx").on(
      table.userId,
      table.type,
      table.deliveredAt,
    ),
  }),
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobName: text("job_name").notNull(),
    userId: text("user_id").references(() => user.id),
    status: text("status").notNull().default("running"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    jobUserIdx: index("job_runs_job_user_idx").on(table.jobName, table.userId),
  }),
);
