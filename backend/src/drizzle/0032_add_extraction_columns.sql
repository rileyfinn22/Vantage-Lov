-- Add extraction columns to interaction_objections for clip data and traceability
ALTER TABLE "interaction_objections" ADD COLUMN "verbatim_quote" text;--> statement-breakpoint
ALTER TABLE "interaction_objections" ADD COLUMN "timestamp_start" text;--> statement-breakpoint
ALTER TABLE "interaction_objections" ADD COLUMN "timestamp_end" text;--> statement-breakpoint
ALTER TABLE "interaction_objections" ADD COLUMN "sales_phase" text;--> statement-breakpoint
ALTER TABLE "interaction_objections" ADD COLUMN "rep_response" text;--> statement-breakpoint
ALTER TABLE "interaction_objections" ADD COLUMN "rep_response_effectiveness" text;--> statement-breakpoint
ALTER TABLE "interaction_objections" ADD COLUMN "rep_response_timestamp_start" text;--> statement-breakpoint
ALTER TABLE "interaction_objections" ADD COLUMN "rep_response_timestamp_end" text;--> statement-breakpoint
ALTER TABLE "interaction_objections" ADD COLUMN "clip_worthy_rating" integer;--> statement-breakpoint
ALTER TABLE "interaction_objections" ADD COLUMN "clip_reason" text;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "verbatim_quote" text;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "timestamp_start" text;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "timestamp_end" text;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "sales_phase" text;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "pain_type" text;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "capitalized_on" boolean;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "capitalization_quote" text;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "root_cause" text;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "clip_worthy_rating" integer;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" ADD COLUMN "clip_reason" text;
