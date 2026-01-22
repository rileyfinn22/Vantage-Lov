-- Update prompt_setting_keys enum from ('rating', 'flagging', 'training') to ('rating', 'flagging', 'training_flag', 'training_scenario')

-- Step 1: Add new enum values 'training_flag' and 'training_scenario'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'training_flag' AND enumtypid = 'prompt_setting_keys'::regtype) THEN
        ALTER TYPE "public"."prompt_setting_keys" ADD VALUE 'training_flag';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'training_scenario' AND enumtypid = 'prompt_setting_keys'::regtype) THEN
        ALTER TYPE "public"."prompt_setting_keys" ADD VALUE 'training_scenario';
    END IF;
END $$;--> statement-breakpoint

-- Step 2: Migrate any existing 'training' rows to 'training_flag' as default
-- (This makes sense since flag-based training is more likely to have been customized)
UPDATE "system_prompt_settings" SET "key" = 'training_flag' WHERE "key" = 'training';--> statement-breakpoint

-- Step 3: Remove 'training' enum value by recreating the enum
-- Create new enum type
CREATE TYPE "public"."prompt_setting_keys_new" AS ENUM('rating', 'flagging', 'training_flag', 'training_scenario');--> statement-breakpoint

-- Step 4: Alter column to use new enum
ALTER TABLE "system_prompt_settings"
  ALTER COLUMN "key" TYPE "prompt_setting_keys_new"
  USING "key"::text::"prompt_setting_keys_new";--> statement-breakpoint

-- Step 5: Drop old enum and rename new one
DROP TYPE "public"."prompt_setting_keys";--> statement-breakpoint
ALTER TYPE "public"."prompt_setting_keys_new" RENAME TO "prompt_setting_keys";
