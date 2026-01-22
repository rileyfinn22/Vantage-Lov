ALTER TABLE "bigfiles" ADD COLUMN "transcript_data" json;--> statement-breakpoint
ALTER TABLE "bigfiles" DROP COLUMN "transcript_text";