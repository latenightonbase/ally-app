-- Add weekly_insights table for persisting and delivering weekly emotional insight reports

CREATE TABLE IF NOT EXISTS "weekly_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "week_of" text NOT NULL,
  "summary" text NOT NULL,
  "mood_trend" text NOT NULL,
  "top_themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "follow_up_suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "delivered" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_insights_user_week_idx" ON "weekly_insights" ("user_id", "week_of");
CREATE INDEX IF NOT EXISTS "weekly_insights_user_created_idx" ON "weekly_insights" ("user_id", "created_at");
