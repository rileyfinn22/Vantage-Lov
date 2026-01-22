-- Add combined_analysis to prompt_setting_keys enum
ALTER TYPE "prompt_setting_keys" ADD VALUE IF NOT EXISTS 'combined_analysis';
