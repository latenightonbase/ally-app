CREATE TYPE "public"."reminder_source" AS ENUM('chat', 'extraction', 'onboarding', 'system');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'dismissed');--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"remind_at" timestamp with time zone NOT NULL,
	"timezone" text,
	"source" "reminder_source" DEFAULT 'chat' NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"notified_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "ally_name" SET DEFAULT 'Anzi';--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_user_idx" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_pending_idx" ON "reminders" USING btree ("status","remind_at");--> statement-breakpoint
CREATE INDEX "reminders_user_pending_idx" ON "reminders" USING btree ("user_id","status","remind_at");