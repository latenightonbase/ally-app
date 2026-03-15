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
} from "drizzle-orm/pg-core";
import type { MemoryProfile } from "@ally/shared";
import { user } from "./auth-schema";

export { user, session, account, verification } from "./auth-schema";

export const tierEnum = pgEnum("tier", [
  "free_trial",
  "basic",
  "premium",
]);

export const messageRoleEnum = pgEnum("message_role", ["user", "ally"]);

export const memoryCategoryEnum = pgEnum("memory_category", [
  "personal_info",
  "relationships",
  "work",
  "health",
  "interests",
  "goals",
  "emotional_patterns",
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
    content: text("content").notNull(),
    eventDate: timestamp("event_date", { withTimezone: true }).notNull(),
    context: text("context"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
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
