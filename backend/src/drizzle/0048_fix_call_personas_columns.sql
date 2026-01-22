-- Fix call_personas table to match current schema
-- Remove old columns that are no longer used
ALTER TABLE call_personas DROP COLUMN IF EXISTS verbal_tics;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS sentence_rhythm;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS vocabulary_level;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS metaphor_preferences;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS question_patterns;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS interruption_style;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS listening_indicators;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS agreement_phrases;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS disagreement_phrases;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS enthusiasm_markers;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS hesitation_markers;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS power_dynamics;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS rapport_building;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS objection_style;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS buying_signals;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS trust_indicators;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS risk_tolerance;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS decision_factors;
--> statement-breakpoint
ALTER TABLE call_personas DROP COLUMN IF EXISTS influence_receptivity;

--> statement-breakpoint

-- Add new columns that match current schema
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS speaking_style TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS psychological_state TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS feeling_beneath_surface TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS what_learned_about_salespeople TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS what_earns_respect TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS what_triggers_shutdown TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS internal_narrator TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS bullshit_detector TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS engagement_thermostat TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS knowledge_not_shared TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS mental_model_of_problem TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS resolution_positive TEXT;
--> statement-breakpoint
ALTER TABLE call_personas ADD COLUMN IF NOT EXISTS resolution_negative TEXT;
