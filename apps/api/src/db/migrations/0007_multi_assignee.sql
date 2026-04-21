-- Add multi-assignee support to reminders and tasks.
-- Tasks: convert tasks.assigned_to (uuid) -> jsonb string[] with backfill.
-- Reminders: convert reminders.target_member_id (uuid) -> target_member_ids jsonb string[] with backfill.
-- Also extends reminder_source enum with "user" and "proactive".

-- ---------- reminders ----------

ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "target_member_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from the old single-value column if it exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reminders' AND column_name = 'target_member_id'
  ) THEN
    UPDATE "reminders"
      SET "target_member_ids" = to_jsonb(ARRAY["target_member_id"]::text[])
      WHERE "target_member_id" IS NOT NULL
        AND ("target_member_ids" IS NULL OR "target_member_ids" = '[]'::jsonb);

    ALTER TABLE "reminders" DROP COLUMN "target_member_id";
  END IF;
END $$;

-- Extend source enum (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'reminder_source'::regtype AND enumlabel = 'user'
  ) THEN
    ALTER TYPE "reminder_source" ADD VALUE 'user';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'reminder_source'::regtype AND enumlabel = 'proactive'
  ) THEN
    ALTER TYPE "reminder_source" ADD VALUE 'proactive';
  END IF;
END $$;

-- ---------- tasks ----------

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'assigned_to';

  IF col_type = 'uuid' THEN
    -- Drop FK + index that reference the single-assignee column.
    EXECUTE 'DROP INDEX IF EXISTS "tasks_assigned_idx"';
    EXECUTE 'ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_assigned_to_family_members_id_fk"';

    -- Convert the column in place, wrapping existing uuid values into a one-element jsonb array.
    EXECUTE $sql$
      ALTER TABLE "tasks"
        ALTER COLUMN "assigned_to" DROP DEFAULT,
        ALTER COLUMN "assigned_to" TYPE jsonb
          USING CASE
            WHEN "assigned_to" IS NULL THEN '[]'::jsonb
            ELSE to_jsonb(ARRAY["assigned_to"]::text[])
          END,
        ALTER COLUMN "assigned_to" SET NOT NULL,
        ALTER COLUMN "assigned_to" SET DEFAULT '[]'::jsonb
    $sql$;
  END IF;
END $$;
