-- Add training_session column to flags table
-- This column stores training session data when a flag training session is completed

ALTER TABLE flags ADD COLUMN IF NOT EXISTS training_session JSONB;

