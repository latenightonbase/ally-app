-- Baseline migration: full schema from scratch
-- Uses IF NOT EXISTS throughout so it is safe to run on both fresh and existing databases.

-- Enums (created only if they don't already exist)

DO $$ BEGIN
  CREATE TYPE "public"."tier" AS ENUM('free_trial', 'basic', 'premium');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."message_role" AS ENUM('user', 'ally');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."memory_category" AS ENUM(
    'personal_info', 'relationships', 'work', 'health',
    'interests', 'goals', 'emotional_patterns'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."memory_source_type" AS ENUM('chat', 'calendar', 'notes', 'health');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."entity_type" AS ENUM('person', 'place', 'org', 'topic', 'goal');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- better-auth core tables

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "ally_name" text DEFAULT 'Ally',
  "notification_preferences" jsonb,
  "expo_push_token" text,
  "tier" text DEFAULT 'free_trial',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_email_unique" UNIQUE("email")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL,
  CONSTRAINT "session_token_unique" UNIQUE("token")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- App tables

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "preview" text,
  "message_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sessions_v2" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "summary" text,
  "message_count" integer DEFAULT 0 NOT NULL,
  "token_estimate" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "session_id" uuid,
  "role" "message_role" NOT NULL,
  "content" text NOT NULL,
  "feedback" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "memory_profiles" (
  "user_id" text PRIMARY KEY NOT NULL,
  "profile" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "memory_facts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "content" text NOT NULL,
  "category" "memory_category" NOT NULL,
  "importance" real DEFAULT 0.5 NOT NULL,
  "confidence" real DEFAULT 0.8 NOT NULL,
  "temporal" boolean DEFAULT false NOT NULL,
  "entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "emotion" text,
  "source_conversation_id" uuid,
  "source_date" timestamp with time zone DEFAULT now() NOT NULL,
  "last_accessed_at" timestamp with time zone,
  "superseded_by" uuid,
  "consolidated_from" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_type" "memory_source_type" DEFAULT 'chat' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "briefings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "date" text NOT NULL,
  "content" text NOT NULL,
  "delivered" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_name" text NOT NULL,
  "user_id" text,
  "status" text DEFAULT 'running' NOT NULL,
  "metadata" jsonb,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);--> statement-breakpoint

-- Foreign keys (using DO blocks to skip if already present)

DO $$ BEGIN
  ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "sessions_v2" ADD CONSTRAINT "sessions_v2_conversation_id_conversations_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "sessions_v2" ADD CONSTRAINT "sessions_v2_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_v2_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "public"."sessions_v2"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_profiles" ADD CONSTRAINT "memory_profiles_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_source_conversation_id_conversations_id_fk"
    FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "briefings" ADD CONSTRAINT "briefings_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Indexes

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_user_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_user_last_msg_idx" ON "conversations" USING btree ("user_id", "last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_v2_conv_idx" ON "sessions_v2" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_v2_user_idx" ON "sessions_v2" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_v2_user_time_idx" ON "sessions_v2" USING btree ("user_id", "started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_time_idx" ON "messages" USING btree ("conversation_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_session_idx" ON "messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_facts_user_idx" ON "memory_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_facts_user_category_idx" ON "memory_facts" USING btree ("user_id", "category");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "briefings_user_date_idx" ON "briefings" USING btree ("user_id", "date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_runs_job_user_idx" ON "job_runs" USING btree ("job_name", "user_id");--> statement-breakpoint

-- Also add onboarding columns to user if they somehow don't exist yet (idempotent)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "ally_name" text DEFAULT 'Ally';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "notification_preferences" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "expo_push_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "tier" text DEFAULT 'free_trial';
