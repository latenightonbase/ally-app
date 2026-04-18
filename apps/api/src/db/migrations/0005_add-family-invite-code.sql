ALTER TABLE "families" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_invite_code_unique" UNIQUE("invite_code");