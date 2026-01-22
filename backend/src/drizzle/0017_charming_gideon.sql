ALTER TABLE "bigfiles" DROP CONSTRAINT "bigfiles_interaction_id_interactions_id_fk";
--> statement-breakpoint
ALTER TABLE "flags" ALTER COLUMN "flag_data" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "flags" ALTER COLUMN "agent_prompt" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "interactions" ALTER COLUMN "v1_raw_google_diarized" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "interactions" ALTER COLUMN "notes" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "bigfiles" ADD CONSTRAINT "bigfiles_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE set null ON UPDATE no action;