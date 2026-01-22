ALTER TYPE prompt_setting_keys ADD VALUE IF NOT EXISTS 'call_persona';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS call_personas (
    id SERIAL PRIMARY KEY,
    interaction_id INTEGER NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES company(id) ON DELETE CASCADE,

    -- Prospect info
    prospect_name TEXT,
    prospect_company TEXT,
    prospect_role TEXT,
    prospect_industry TEXT,
    company_size TEXT,
    location TEXT,

    -- Business context
    budget_range TEXT,
    decision_timeline TEXT,
    team_size TEXT,
    current_solution TEXT,
    deal_stage TEXT,
    buying_authority TEXT,
    pain_severity INTEGER,

    -- Call context
    call_type TEXT,
    call_stage TEXT,
    key_topics JSONB,
    numbers_discussed JSONB,
    competitors_mentioned JSONB,

    -- Key quotes
    objection_quotes JSONB,
    interest_signals JSONB,
    concern_quotes JSONB,
    opening_line TEXT,

    -- Communication patterns
    tone TEXT,
    communication_style TEXT,
    energy_level TEXT,
    speech_patterns JSONB,

    -- Psychological persona
    core_identity TEXT,
    processing_style TEXT,
    filler_words JSONB,
    verbal_tics JSONB,
    sentence_rhythm TEXT,
    vocabulary_level TEXT,
    metaphor_preferences JSONB,
    question_patterns JSONB,
    interruption_style TEXT,
    listening_indicators JSONB,
    agreement_phrases JSONB,
    disagreement_phrases JSONB,
    enthusiasm_markers JSONB,
    hesitation_markers JSONB,
    power_dynamics TEXT,
    rapport_building JSONB,
    objection_style TEXT,
    buying_signals JSONB,
    trust_indicators JSONB,
    risk_tolerance TEXT,
    decision_factors JSONB,
    influence_receptivity TEXT,

    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_call_personas_interaction_id ON call_personas(interaction_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_call_personas_company_id ON call_personas(company_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_call_personas_industry ON call_personas(prospect_industry);
