-- Add company_id column to training_assignments table
-- This column is needed to link training assignments to their company context

-- Step 1: Add the column as nullable first
ALTER TABLE "training_assignments" ADD COLUMN "company_id" integer;--> statement-breakpoint

-- Step 2: Populate company_id from salespeople table for existing rows
UPDATE "training_assignments"
SET "company_id" = (
    SELECT "company_id"
    FROM "salespeople"
    WHERE "salespeople"."id" = "training_assignments"."salesperson_id"
)
WHERE "company_id" IS NULL;--> statement-breakpoint

-- Step 3: Make the column NOT NULL and add foreign key constraint
ALTER TABLE "training_assignments" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE cascade ON UPDATE no action;
