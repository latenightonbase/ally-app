-- Migration: add memory_episodes, memory_events, weekly_insights;
-- drop legacy pgvector columns; add superseded_by, consolidated_from, source_type to memory_facts.
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS / DO blocks).

DO $$ BEGIN
  CREATE TYPE "public"."entity_type" AS ENUM('person', 'place', 'org', 'topic', 'goal');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."memory_source_type" AS ENUM('chat', 'calendar', 'notes', 'health');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "memory_episodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "content" text NOT NULL,
  "category" "memory_category" NOT NULL,
  "emotion" text,
  "entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "importance" real DEFAULT 0.5 NOT NULL,
  "confidence" real DEFAULT 0.8 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consolidated_at" timestamp with time zone,
  "consolidated_into_fact_id" uuid,
  "source_conversation_id" uuid,
  "source_type" "memory_source_type" DEFAULT 'chat' NOT NULL,
  "source_date" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "memory_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "content" text NOT NULL,
  "event_date" timestamp with time zone NOT NULL,
  "context" text,
  "notified_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "source_conversation_id" uuid,
  "source_type" "memory_source_type" DEFAULT 'chat' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "weekly_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "week_of" text NOT NULL,
  "summary" text NOT NULL,
  "mood_trend" text NOT NULL,
  "top_themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "follow_up_suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "delivered" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Drop legacy pgvector indexes if they exist (only present on old databases)
DROP INDEX IF EXISTS "memory_facts_embedding_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "memory_facts_search_idx";--> statement-breakpoint

-- Add new columns to memory_facts (idempotent)
ALTER TABLE "memory_facts" ADD COLUMN IF NOT EXISTS "superseded_by" uuid;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD COLUMN IF NOT EXISTS "consolidated_from" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD COLUMN IF NOT EXISTS "source_type" "memory_source_type" DEFAULT 'chat' NOT NULL;--> statement-breakpoint

-- Drop legacy embedding column if it exists (only present on old pgvector databases)
ALTER TABLE "memory_facts" DROP COLUMN IF EXISTS "embedding";--> statement-breakpoint

-- Foreign key constraints (skip if already present)
DO $$ BEGIN
  ALTER TABLE "memory_episodes" ADD CONSTRAINT "memory_episodes_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_episodes" ADD CONSTRAINT "memory_episodes_source_conversation_id_conversations_id_fk"
    FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_events" ADD CONSTRAINT "memory_events_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_events" ADD CONSTRAINT "memory_events_source_conversation_id_conversations_id_fk"
    FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "weekly_insights" ADD CONSTRAINT "weekly_insights_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Indexes (IF NOT EXISTS is safe on existing DBs too)
CREATE INDEX IF NOT EXISTS "memory_episodes_user_idx" ON "memory_episodes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_episodes_expires_idx" ON "memory_episodes" USING btree ("user_id", "expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_episodes_unconsolidated_idx" ON "memory_episodes" USING btree ("user_id", "consolidated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_events_user_idx" ON "memory_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_events_upcoming_idx" ON "memory_events" USING btree ("user_id", "event_date", "completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_insights_user_week_idx" ON "weekly_insights" USING btree ("user_id", "week_of");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_insights_user_created_idx" ON "weekly_insights" USING btree ("user_id", "created_at");--> statement-breakpoint

-- Recreate tier enum as a proper 3-value enum (was 2-value on some old DBs)
DROP TYPE IF EXISTS "public"."tier";--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."tier" AS ENUM('free_trial', 'basic', 'premium');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
