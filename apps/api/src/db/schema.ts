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
import { sql } from "drizzle-orm";
import { vector } from "drizzle-orm/pg-core";
import type { MemoryProfile } from "@ally/shared";
import { user } from "./auth-schema";

export { user, session, account, verification } from "./auth-schema";

export const tierEnum = pgEnum("tier", [
  "free_trial",
  "basic",
  "pro",
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

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_idx").on(table.conversationId),
    conversationTimeIdx: index("messages_conversation_time_idx").on(
      table.conversationId,
      table.createdAt,
    ),
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
    embedding: vector("embedding", { dimensions: 1024 }),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
    ),
    sourceDate: timestamp("source_date", { withTimezone: true }).defaultNow().notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("memory_facts_user_idx").on(table.userId),
    userCategoryIdx: index("memory_facts_user_category_idx").on(
      table.userId,
      table.category,
    ),
    embeddingIdx: index("memory_facts_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    searchIdx: index("memory_facts_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.content})`,
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
