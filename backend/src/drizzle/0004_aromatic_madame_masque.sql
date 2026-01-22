CREATE TYPE "public"."processed_status" AS ENUM('unprocessed', 'processing', 'processed');--> statement-breakpoint
ALTER TABLE "bigfiles" ADD COLUMN "processed_status" "processed_status" DEFAULT 'unprocessed' NOT NULL;--> statement-breakpoint
ALTER TABLE "bigfiles" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "bigfiles" ADD COLUMN "transcript_text" text;