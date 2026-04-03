-- Add next_daily_ping_at column for reliable timer-based daily pings.
-- Instead of fragile string-matching the user's local time every minute,
-- we store an absolute UTC timestamp and check nextDailyPingAt <= now().
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "next_daily_ping_at" timestamp with time zone;

-- Index for the scheduler to efficiently find users whose ping is due
CREATE INDEX IF NOT EXISTS "user_next_daily_ping_idx"
  ON "user" ("next_daily_ping_at")
  WHERE "next_daily_ping_at" IS NOT NULL;
