# Call Analysis Pipeline Restructure Plan

## Goals
1. Reliable call processing with full visibility into errors
2. Clean database schema in Supabase (fresh start)
3. Proper company context flow (brain → prompts → output)
4. Working feedback loop (ratings, coach notes → aggregation → updated context)
5. Scalable architecture that works now and grows later

---

## Phase 1: Database Schema (Supabase)

### Core Tables (Already Exist, Verify Schema)
```
companies
├── id, name, created_at
└── Settings/config fields

salespeople
├── id, company_id, user_id, name, email, avatar
└── FK: companies(id)

interactions (sales calls)
├── id, salesperson_id, name, duration, transcript
├── processed_status: 'unprocessed' | 'processing' | 'processed' | 'failed'
├── metadata (JSONB - call context, prospect info)
└── FK: salespeople(id)

bigfiles (uploaded media)
├── id, interaction_id, file_path, file_size, mime_type
└── FK: interactions(id)
```

### Analysis Output Tables
```
ratings
├── id, interaction_id, type, score, blurb
├── created_at
└── FK: interactions(id)

skills_assessments
├── id, interaction_id, salesperson_id
├── objection_handling, discovery, pricing_discussions, closing (1-100 each)
├── created_at
└── FK: interactions(id), salespeople(id)

flags (coaching moments)
├── id, interaction_id, salesperson_id
├── reason, better_response, quote, timestamp_start/end
├── complete (boolean - rep reviewed)
├── rep_rating (1-10, nullable)
├── bad_flag_report (JSONB, nullable)
├── manager_review (JSONB, nullable)
├── coach_notes (text, nullable)
├── training_session (JSONB, nullable)
└── FK: interactions(id), salespeople(id)

call_personas
├── id, interaction_id, company_id
├── prospect_name, prospect_company, prospect_role, etc.
├── psychological persona fields (core_identity, processing_style, etc.)
└── FK: interactions(id), companies(id)
```

### Company Brain Tables
```
company_ai_context (THE BRAIN)
├── id, company_id
├── context_type: enum (
│     'sales_language', 'objection_patterns', 'success_patterns',
│     'terminology', 'anti_patterns', 'battle_card_strategies',
│     'onboarding_knowledge', 'coach_notes', 'rep_benchmarks',
│     'ideal_responses'
│   )
├── data (JSONB - flexible per type)
├── confidence (0-1)
├── sample_size (int)
├── version (int)
├── last_updated
└── FK: companies(id)

company_training_data
├── id, company_id
├── product_positioning, unique_selling_points, competitors, etc.
├── example_good_call, example_bad_call (text)
└── FK: companies(id)

battle_cards
├── id, company_id
├── title, challenge, phase, strategy, approach, script, next_step
├── status: 'draft' | 'active' | 'archived'
├── is_edited (boolean - human touched = ground truth)
└── FK: companies(id)
```

### Prompt Management
```
system_prompt_settings
├── id, company_id (nullable for global defaults)
├── key: enum ('rating', 'flagging', 'extraction', 'persona', etc.)
├── prompt (text)
├── version (int)
├── active (boolean)
└── FK: companies(id)
```

---

## Phase 2: Call Processing Pipeline (Local Execution)

### Remove Mastra Cloud Dependency
1. Delete or disable `MastraCloudService.ts` usage
2. Use `analyzeCall()` from `slopAsker.ts` directly (already works locally)
3. Or refactor to simpler orchestration:

### Simplified Pipeline Code Structure
```
backend/src/services/
├── CallProcessingService.ts      # Orchestrates the full flow
├── TranscriptionService.ts       # ElevenLabs STT (already exists)
├── CompanyContextService.ts      # Load & format company brain
├── agents/
│   ├── RatingAgent.ts           # Score call quality + skills
│   ├── FlaggingAgent.ts         # Identify coaching moments
│   ├── ExtractionAgent.ts       # Extract objections, pain points
│   └── PersonaAgent.ts          # Extract psychological profile
└── FeedbackAggregationService.ts # Update company brain from feedback
```

### Pipeline Flow
```
1. UPLOAD
   └── Store file → Create interaction → Trigger processing

2. TRANSCRIPTION
   └── ElevenLabs STT → Store transcript → Update interaction

3. CONTEXT LOADING
   └── Load company_ai_context → Format per agent

4. ANALYSIS (Sequential for prompt caching)
   ├── Rating Agent (CACHE WRITE)
   │   └── Score: overall + 4 skills
   ├── Flagging Agent (CACHE HIT)
   │   └── 0-5 coaching moments
   ├── Extraction Agent (CACHE HIT)
   │   └── Objections, pain points
   └── Persona Agent (CACHE HIT)
       └── Psychological profile

5. STORAGE
   └── Write ratings, flags, skills, persona to Supabase

6. STATUS UPDATE
   └── Mark interaction as 'processed'
```

### Error Handling
```
- Each step wrapped in try/catch
- Failures update interaction.processed_status = 'failed'
- Store error details in interaction.metadata.error
- Allow retry via API endpoint
```

---

## Phase 3: Company Context Flow (The Brain)

### Context Loading
```typescript
// CompanyContextService.ts
async loadContext(companyId: number): Promise<CompanyContext> {
  const contextRows = await db.select()
    .from(companyAiContext)
    .where(eq(companyAiContext.companyId, companyId));

  return {
    salesLanguage: find(contextRows, 'sales_language')?.data,
    objectionPatterns: find(contextRows, 'objection_patterns')?.data,
    successPatterns: find(contextRows, 'success_patterns')?.data,
    terminology: find(contextRows, 'terminology')?.data,
    antiPatterns: find(contextRows, 'anti_patterns')?.data,
    battleCardStrategies: find(contextRows, 'battle_card_strategies')?.data,
    onboardingKnowledge: find(contextRows, 'onboarding_knowledge')?.data,
    coachNotes: find(contextRows, 'coach_notes')?.data,
    repBenchmarks: find(contextRows, 'rep_benchmarks')?.data,
    idealResponses: find(contextRows, 'ideal_responses')?.data,
  };
}
```

### Per-Agent Formatting
```typescript
// Each agent gets tailored context
formatForRating(ctx): {
  successPatterns,    // What good looks like
  repBenchmarks,      // Calibration data
  coachNotes          // Current priorities
}

formatForFlagging(ctx): {
  objectionPatterns,  // What to look for
  antiPatterns,       // What NOT to flag (from bad_flag_reports)
  coachNotes,
  repBenchmarks
}

formatForExtraction(ctx): {
  battleCardStrategies,  // What objections matter
  terminology,
  coachNotes
}

formatForPersona(ctx): {
  onboardingKnowledge,  // Industry context
  terminology
}
```

---

## Phase 4: Feedback Loop

### Triggers
```
1. Rep rates a flag (1-10)
   └── Immediate: Update flag.rep_rating
   └── Debounced: Trigger aggregation (1 min delay)

2. Rep reports bad flag
   └── Immediate: Store flag.bad_flag_report
   └── Debounced: Trigger aggregation

3. Manager reviews flag
   └── Immediate: Store flag.manager_review
   └── Debounced: Trigger aggregation

4. Battle card edited
   └── Mark battle_card.is_edited = true
   └── Trigger aggregation
```

### Aggregation Service
```typescript
// FeedbackAggregationService.ts
async aggregateForCompany(companyId: number) {
  // Run all extractors in parallel
  const [
    salesLanguage,
    objectionPatterns,
    successPatterns,
    terminology,
    antiPatterns,
    battleCardStrategies,
    onboardingKnowledge,
    coachNotes,
    repBenchmarks,
    idealResponses
  ] = await Promise.all([
    this.extractSalesLanguage(companyId),
    this.extractObjectionPatterns(companyId),
    this.extractSuccessPatterns(companyId),
    this.extractTerminology(companyId),
    this.extractAntiPatterns(companyId),      // From bad_flag_reports!
    this.extractBattleCardStrategies(companyId),
    this.extractOnboardingKnowledge(companyId),
    this.extractCoachNotes(companyId),
    this.extractRepBenchmarks(companyId),
    this.extractIdealResponses(companyId)
  ]);

  // Upsert each context type
  await this.upsertContext(companyId, 'sales_language', salesLanguage);
  // ... etc
}
```

### Signal Weights
```
bad_flag_reports:     1.0   (highest - explicit rejection)
coach_notes:          0.95  (expert knowledge)
battle_card_edits:    0.95  (human ground truth)
high_flag_ratings:    0.85  (8-10 = helpful)
low_flag_ratings:     0.85  (1-4 = not helpful)
top_performer:        0.8   (success patterns)
low_performer:        0.6   (anti-patterns)
```

---

## Phase 5: Implementation Order

### Week 1: Foundation
1. [ ] Verify/fix Supabase schema (all tables above)
2. [ ] Remove Mastra Cloud calls, use local execution
3. [ ] Test basic flow: upload → transcribe → analyze → store
4. [ ] Ensure PGlite still works for local dev

### Week 2: Context & Agents
1. [ ] Refactor CompanyContextService for clean loading
2. [ ] Implement per-agent context formatters
3. [ ] Ensure prompt caching is working (check Anthropic dashboard)
4. [ ] Add proper error handling and status tracking

### Week 3: Feedback Loop
1. [ ] Implement feedback API endpoints (rate flag, report bad flag, etc.)
2. [ ] Add debounced aggregation triggers
3. [ ] Test full loop: feedback → aggregation → updated context → better analysis

### Week 4: Polish & Scale Prep
1. [ ] Add job queue (BullMQ) for background processing
2. [ ] Implement retry logic for failed analyses
3. [ ] Add monitoring/logging for production visibility
4. [ ] Load testing and optimization

---

## Future Scaling Path

### Current (Local)
- Single backend process
- Synchronous or simple async processing
- Good for: MVP, <1000 calls/day

### Scale-Out (Queue-Based)
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   API       │────▶│   BullMQ     │────▶│  Workers    │
│   Server    │     │   (Redis)    │     │  (N procs)  │
└─────────────┘     └──────────────┘     └─────────────┘
```
- Add Redis + BullMQ
- Separate worker processes
- Horizontal scaling
- Good for: 1K-50K calls/day

### Serverless (High Scale)
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   API       │────▶│   Inngest/   │────▶│  Cloud Run  │
│   Server    │     │   Trigger    │     │   Jobs      │
└─────────────┘     └──────────────┘     └─────────────┘
```
- Serverless job execution
- Auto-scaling
- Pay per execution
- Good for: 50K+ calls/day

---

## Decisions Made

1. **Prompt storage**: ✅ Database
   - Editable via admin UI without deploy
   - Version tracking for rollback
   - Company-specific overrides possible

2. **Aggregation frequency**: Debounced (current approach)
   - Triggers 1 min after last feedback event
   - Good balance of freshness and efficiency

3. **Error recovery**: Auto-retry with backoff
   - 3 retries with exponential backoff
   - After 3 failures, mark as 'failed' for manual review

4. **Monitoring priorities**:
   - Processing time per step
   - Error rates by step
   - Prompt cache hit rate (cost savings)
   - Feedback loop velocity

---

## Prompt Management System (Database-Driven)

### Schema
```sql
CREATE TABLE prompt_templates (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),  -- NULL = global default
  agent_type TEXT NOT NULL,  -- 'rating', 'flagging', 'extraction', 'persona'
  prompt_type TEXT NOT NULL, -- 'system', 'user_template'
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),

  UNIQUE(company_id, agent_type, prompt_type, version)
);

-- Index for fast lookups
CREATE INDEX idx_prompt_templates_lookup
  ON prompt_templates(company_id, agent_type, is_active);
```

### Prompt Resolution Order
```
1. Company-specific active prompt (if exists)
2. Global default active prompt
3. Hardcoded fallback (safety net)
```

### Admin UI Features
- View/edit prompts per company
- Version history with diff view
- A/B testing (multiple active versions)
- Rollback to previous version
- Preview with sample transcript
