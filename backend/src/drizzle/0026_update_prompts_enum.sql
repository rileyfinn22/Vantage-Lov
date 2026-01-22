-- Update prompt_setting_keys enum from ('master', 'rating', 'flagging') to ('rating', 'flagging', 'training')

-- Step 1: Add 'training' value to existing enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'training' AND enumtypid = 'prompt_setting_keys'::regtype) THEN
        ALTER TYPE "public"."prompt_setting_keys" ADD VALUE 'training';
    END IF;
END $$;--> statement-breakpoint

-- Step 2: Update any existing 'master' rows to 'flagging' (if any exist)
UPDATE "system_prompt_settings" SET "key" = 'flagging' WHERE "key" = 'master';--> statement-breakpoint

-- Step 3: Remove 'master' enum value by recreating the enum
-- Create new enum type
CREATE TYPE "public"."prompt_setting_keys_new" AS ENUM('rating', 'flagging', 'training');--> statement-breakpoint

-- Alter column to use new enum
ALTER TABLE "system_prompt_settings"
  ALTER COLUMN "key" TYPE "prompt_setting_keys_new"
  USING "key"::text::"prompt_setting_keys_new";--> statement-breakpoint

-- Drop old enum and rename new one
DROP TYPE "public"."prompt_setting_keys";--> statement-breakpoint
ALTER TYPE "public"."prompt_setting_keys_new" RENAME TO "prompt_setting_keys";
