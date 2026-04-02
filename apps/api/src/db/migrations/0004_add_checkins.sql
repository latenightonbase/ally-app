-- Add proactive check-ins feature
-- 1. Create checkin_type enum
DO $$ BEGIN
  CREATE TYPE "checkin_type" AS ENUM ('casual', 'event_followup', 'goal_checkin', 'context_aware');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create checkins table
CREATE TABLE IF NOT EXISTS "checkins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE SET NULL,
  "type" "checkin_type" NOT NULL DEFAULT 'casual',
  "content" text NOT NULL,
  "event_id" uuid REFERENCES "memory_events"("id") ON DELETE SET NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "push_sent" boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "checkins_user_idx" ON "checkins" ("user_id");
CREATE INDEX IF NOT EXISTS "checkins_user_delivered_idx" ON "checkins" ("user_id", "delivered_at");
CREATE INDEX IF NOT EXISTS "checkins_user_type_idx" ON "checkins" ("user_id", "type", "delivered_at");

-- 3. Add followed_up_at column to memory_events for tracking event follow-ups
ALTER TABLE "memory_events"
  ADD COLUMN IF NOT EXISTS "followed_up_at" timestamp with time zone;
