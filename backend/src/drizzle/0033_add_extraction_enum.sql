-- Add extraction to prompt_setting_keys enum
ALTER TYPE "prompt_setting_keys" ADD VALUE IF NOT EXISTS 'extraction';
