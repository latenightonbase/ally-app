CREATE TABLE IF NOT EXISTS "reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "body" text,
  "remind_at" timestamp with time zone NOT NULL,
  "timezone" text,
  "source" text NOT NULL DEFAULT 'chat',
  "status" text NOT NULL DEFAULT 'pending',
  "notified_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "reminders_user_idx" ON "reminders" ("user_id");
CREATE INDEX "reminders_pending_idx" ON "reminders" ("status", "remind_at") WHERE "status" = 'pending';
CREATE INDEX "reminders_user_pending_idx" ON "reminders" ("user_id", "status", "remind_at");
