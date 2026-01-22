-- Add new values to ai_context_types enum for expanded feedback aggregation
ALTER TYPE ai_context_types ADD VALUE IF NOT EXISTS 'battle_card_strategies';--> statement-breakpoint
ALTER TYPE ai_context_types ADD VALUE IF NOT EXISTS 'onboarding_knowledge';--> statement-breakpoint
ALTER TYPE ai_context_types ADD VALUE IF NOT EXISTS 'coach_notes';--> statement-breakpoint
ALTER TYPE ai_context_types ADD VALUE IF NOT EXISTS 'rep_benchmarks';--> statement-breakpoint
ALTER TYPE ai_context_types ADD VALUE IF NOT EXISTS 'ideal_responses';
