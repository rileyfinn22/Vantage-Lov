ALTER TABLE "company" ADD COLUMN "monthly_revenue_goal" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "blurb" text NOT NULL;