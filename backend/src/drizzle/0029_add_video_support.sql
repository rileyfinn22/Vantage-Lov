-- Add video support columns to bigfiles table
ALTER TABLE "bigfiles" ADD COLUMN "extracted_audio_file_id" integer;--> statement-breakpoint
ALTER TABLE "bigfiles" ADD COLUMN "video_metadata" jsonb;
