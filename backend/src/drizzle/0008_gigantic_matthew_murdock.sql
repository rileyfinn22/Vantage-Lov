ALTER TABLE "auth_user_roles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bigfiles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_user_roles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interaction_objections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interaction_pain_points" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "objections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pain_points" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ratings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salesperson_ratings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salespeople" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flags" ALTER COLUMN "reason" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "flag_data" json;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "processed_status" "processed_status" DEFAULT 'unprocessed' NOT NULL;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "v1_raw_google_diarized" json;--> statement-breakpoint
ALTER TABLE "bigfiles" DROP COLUMN "processed_status";--> statement-breakpoint
ALTER TABLE "bigfiles" DROP COLUMN "processed_at";--> statement-breakpoint
ALTER TABLE "bigfiles" DROP COLUMN "transcript_data";
