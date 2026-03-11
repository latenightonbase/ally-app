-- Incremental migration: add sessions_v2 table, session_id + feedback to messages

CREATE TABLE IF NOT EXISTS "sessions_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"summary" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "session_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "feedback" integer;--> statement-breakpoint
ALTER TABLE "sessions_v2" ADD CONSTRAINT "sessions_v2_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_v2" ADD CONSTRAINT "sessions_v2_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_v2_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions_v2"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_v2_conv_idx" ON "sessions_v2" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_v2_user_idx" ON "sessions_v2" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_v2_user_time_idx" ON "sessions_v2" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_session_idx" ON "messages" USING btree ("session_id");
