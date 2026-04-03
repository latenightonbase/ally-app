CREATE TYPE "public"."checkin_type" AS ENUM('casual', 'event_followup', 'goal_checkin', 'context_aware');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"type" "checkin_type" DEFAULT 'casual' NOT NULL,
	"content" text NOT NULL,
	"event_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"push_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_events" ADD COLUMN "followed_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "next_daily_ping_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_event_id_memory_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."memory_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkins_user_idx" ON "checkins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "checkins_user_delivered_idx" ON "checkins" USING btree ("user_id","delivered_at");--> statement-breakpoint
CREATE INDEX "checkins_user_type_idx" ON "checkins" USING btree ("user_id","type","delivered_at");