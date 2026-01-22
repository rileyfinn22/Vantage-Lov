DO $$ BEGIN
 CREATE TYPE "training_assignment_source" AS ENUM('flag', 'skill_threshold', 'battle_card', 'manual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "training_type" AS ENUM('scenario', 'battle_card', 'flag_review');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "training_assignments" ADD COLUMN IF NOT EXISTS "assignment_source" "training_assignment_source";
--> statement-breakpoint
ALTER TABLE "training_assignments" ADD COLUMN IF NOT EXISTS "source_id" text;
--> statement-breakpoint
ALTER TABLE "training_assignments" ADD COLUMN IF NOT EXISTS "training_type" "training_type";
--> statement-breakpoint
ALTER TABLE "training_assignments" ADD COLUMN IF NOT EXISTS "training_id" text;
--> statement-breakpoint
ALTER TABLE "training_assignments" ADD COLUMN IF NOT EXISTS "title" text;
--> statement-breakpoint
ALTER TABLE "training_assignments" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
UPDATE "training_assignments"
SET
    "assignment_source" = 'manual',
    "training_type" = 'scenario',
    "training_id" = COALESCE("skill_name", 'unknown'),
    "title" = COALESCE("skill_name", 'Training Assignment')
WHERE "assignment_source" IS NULL;
--> statement-breakpoint
ALTER TABLE "training_assignments" ALTER COLUMN "assignment_source" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "training_assignments" ALTER COLUMN "training_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "training_assignments" ALTER COLUMN "training_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "training_assignments" ALTER COLUMN "title" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "training_assignments" ALTER COLUMN "assigned_by" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "training_assignments" DROP COLUMN IF EXISTS "skill_name";
--> statement-breakpoint
ALTER TABLE "training_assignments" DROP COLUMN IF EXISTS "notes";
