-- Add ally_name, notification_preferences, and expo_push_token to user table
-- for dynamic onboarding and daily ping notifications

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "ally_name" text DEFAULT 'Ally';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "notification_preferences" jsonb;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "expo_push_token" text;
