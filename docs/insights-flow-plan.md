# Insights Flow Architecture - Phases 1 & 2

## Overview

This document outlines the architecture for extracting objections and pain points from sales call transcripts (Phase 1) and aggregating them into actionable battle cards with training clips (Phase 2).

---

## Current State Analysis

### Existing Infrastructure
- **Database Schema**: Already has `objections`, `pain_points`, `interaction_objections`, `interaction_pain_points` tables
- **Insights Service**: `backend/src/vantage/insights.ts` fetches aggregated data by company
- **Analysis Service**: `CachedAnalysisService.ts` handles AI analysis with prompt caching
- **Lovable Reference**: Full UI flow exists from insights → battlecards → training

### What's Missing
1. **Extraction Service**: No service to extract objections/pain points from individual calls
2. **Clip References**: No timestamp/clip storage for training moments
3. **Aggregation Service**: No pattern recognition across calls
4. **Battle Card Generation**: No automated battle card creation

---

## Phase 1: Call-Level Extraction

### Purpose
Extract objections and pain points from each individual call transcript, including timestamps for training clips.

### New Service: `CallExtractionService.ts`

```typescript
// New Zod schemas for extraction
export const ObjectionExtractionSchema = z.object({
  objections: z.array(z.object({
    type: z.enum(["prospect_objection"]),
    title: z.string(),  // e.g., "Budget constraints"
    verbatim_quote: z.string(),  // Exact words from prospect
    timestamp: z.object({
      start: z.string(),
      end: z.string(),
    }),
    sales_phase: z.enum(["outreach", "discovery", "demo", "close"]),
    rep_response: z.object({
      quote: z.string(),
      effectiveness: z.enum(["overcame", "partially_addressed", "missed", "avoided"]),
      timestamp: z.object({
        start: z.string(),
        end: z.string(),
      }),
    }),
    clip_worthy_rating: z.number().min(1).max(10),
    clip_reason: z.string().nullable(),
  })),
});

export const PainPointExtractionSchema = z.object({
  pain_points: z.array(z.object({
    type: z.enum(["prospect_pain", "rep_pain"]),
    title: z.string(),
    verbatim_quote: z.string(),
    timestamp: z.object({
      start: z.string(),
      end: z.string(),
    }),
    sales_phase: z.enum(["outreach", "discovery", "demo", "close"]),
    // For prospect pain points
    capitalized_on: z.boolean().optional(),
    capitalization_quote: z.string().optional(),
    // For rep pain points
    root_cause: z.string().optional(),
    clip_worthy_rating: z.number().min(1).max(10),
    clip_reason: z.string().nullable(),
  })),
});
```

### Database Schema Changes

The key insight: **Every extracted objection/pain point must be traceable back to its source call and salesperson.**

The existing junction tables (`interaction_objections`, `interaction_pain_points`) already link to `interaction_id`. We need to ensure the `interactions` table provides the salesperson link, and we add clip data.

```sql
-- Verify interactions table has salesperson_id (it does via schema)
-- interactions.salespersonId -> salespeople.id

-- Add clip tracking to interaction_objections
-- These columns store the PER-CALL extraction data (linked to specific interaction + salesperson)
ALTER TABLE interaction_objections ADD COLUMN verbatim_quote TEXT;
ALTER TABLE interaction_objections ADD COLUMN timestamp_start TEXT;       -- e.g., "00:05:23"
ALTER TABLE interaction_objections ADD COLUMN timestamp_end TEXT;         -- e.g., "00:05:47"
ALTER TABLE interaction_objections ADD COLUMN sales_phase TEXT;           -- outreach/discovery/demo/close
ALTER TABLE interaction_objections ADD COLUMN rep_response TEXT;
ALTER TABLE interaction_objections ADD COLUMN rep_response_effectiveness TEXT;  -- overcame/partially_addressed/missed/avoided
ALTER TABLE interaction_objections ADD COLUMN rep_response_timestamp_start TEXT;
ALTER TABLE interaction_objections ADD COLUMN rep_response_timestamp_end TEXT;
ALTER TABLE interaction_objections ADD COLUMN clip_worthy_rating INTEGER; -- 1-10
ALTER TABLE interaction_objections ADD COLUMN clip_reason TEXT;

-- Add clip tracking to interaction_pain_points
-- Same principle: linked to interaction_id which gives us call + salesperson
ALTER TABLE interaction_pain_points ADD COLUMN verbatim_quote TEXT;
ALTER TABLE interaction_pain_points ADD COLUMN timestamp_start TEXT;
ALTER TABLE interaction_pain_points ADD COLUMN timestamp_end TEXT;
ALTER TABLE interaction_pain_points ADD COLUMN sales_phase TEXT;
ALTER TABLE interaction_pain_points ADD COLUMN pain_type TEXT;            -- prospect_pain / rep_pain
ALTER TABLE interaction_pain_points ADD COLUMN capitalized_on BOOLEAN;    -- For prospect pains: did rep leverage it?
ALTER TABLE interaction_pain_points ADD COLUMN capitalization_quote TEXT;
ALTER TABLE interaction_pain_points ADD COLUMN root_cause TEXT;           -- For rep pains: why it happened
ALTER TABLE interaction_pain_points ADD COLUMN clip_worthy_rating INTEGER;
ALTER TABLE interaction_pain_points ADD COLUMN clip_reason TEXT;
```

### Data Traceability Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     TRACEABILITY CHAIN                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  interaction_objections                                         │
│  ├── id (PK)                                                    │
│  ├── interaction_id (FK) ──────┐                                │
│  ├── objection_id (FK) ────────┼─→ objections (aggregated)      │
│  ├── verbatim_quote            │                                │
│  ├── timestamp_start           │                                │
│  ├── timestamp_end             │                                │
│  ├── sales_phase               │                                │
│  ├── rep_response              │                                │
│  ├── rep_response_effectiveness│                                │
│  ├── clip_worthy_rating        │                                │
│  └── clip_reason               │                                │
│                                │                                │
│                                ▼                                │
│  interactions ─────────────────┤                                │
│  ├── id (PK)                   │                                │
│  ├── salesperson_id (FK) ──────┼─→ salespeople                  │
│  ├── company_id (FK)           │   ├── id                       │
│  ├── audio_url                 │   ├── name                     │
│  ├── video_url (if available)  │   └── associated_user_id       │
│  ├── transcript                │                                │
│  └── created_at                │                                │
│                                │                                │
│  FROM ANY EXTRACTED ITEM:      │                                │
│  ├── Get interaction_id → interaction.audio_url (play audio)   │
│  ├── Get interaction_id → interaction.video_url (play video)   │
│  ├── Get interaction_id → interaction.salesperson_id (who)     │
│  ├── Get interaction_id → interaction.created_at (when)        │
│  └── Use timestamps to seek to exact moment in audio/video     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Video Support

The system already has video infrastructure via `bigfiles` table:
- `video_metadata` (jsonb): duration, width, height, codec, etc.
- `extracted_audio_file_id`: Links video to its extracted audio for transcription

For training clips, the UI will:
1. Check if video exists for the interaction
2. If yes → show video player with timestamp seeking
3. If no → fall back to audio player with waveform visualization

```typescript
// Determine media type for clip playback
const getClipMedia = (interaction: Interaction) => {
  if (interaction.videoUrl) {
    return { type: 'video', url: interaction.videoUrl };
  }
  return { type: 'audio', url: interaction.audioUrl };
};
```

### Query Example: Get All Instances of "Budget Constraints" with Source Info

```typescript
// Get all occurrences of a specific objection with full traceability
const budgetObjectionInstances = await db
  .select({
    // The extracted data
    verbatimQuote: interactionObjections.verbatimQuote,
    timestampStart: interactionObjections.timestampStart,
    timestampEnd: interactionObjections.timestampEnd,
    repResponse: interactionObjections.repResponse,
    effectiveness: interactionObjections.repResponseEffectiveness,
    clipRating: interactionObjections.clipWorthyRating,
    wasOvercome: interactionObjections.wasOvercome,

    // The source call (audio AND video if available)
    interactionId: interactions.id,
    audioUrl: interactions.audioUrl,
    videoUrl: interactions.videoUrl,  // null if audio-only call
    callDate: interactions.createdAt,

    // The salesperson
    salespersonId: salespeople.id,
    salespersonName: salespeople.name,
  })
  .from(interactionObjections)
  .innerJoin(interactions, eq(interactionObjections.interactionId, interactions.id))
  .innerJoin(salespeople, eq(interactions.salespersonId, salespeople.id))
  .where(eq(interactionObjections.objectionId, budgetObjectionId))
  .orderBy(desc(interactionObjections.clipWorthyRating));

// Result: Array of every time "Budget Constraints" was raised, with:
// - Who handled it (salesperson)
// - When it happened (call date)
// - Where in the call (timestamps)
// - How to play it (video_url preferred, fallback to audio_url + timestamps)
// - How well they handled it (effectiveness + wasOvercome)
```

### Integration with Existing Analysis Pipeline

The extraction should happen alongside the existing analysis in `CachedAnalysisService`. Options:

**Option A: Add to Combined Analysis (Recommended)**
- Add `extraction` section to `CombinedAnalysisResponse`
- Single API call extracts rating + metadata + persona + objections/pain points
- Most cost-effective due to prompt caching

**Option B: Separate Extraction Call**
- New dedicated call for extraction
- Runs after combined analysis (cache hit)
- More focused prompt, potentially better accuracy

### Extraction Prompt (Stage 1)

```
You are analyzing a sales call transcript to extract specific objections and pain points.

DEFINITIONS:

OBJECTION: A specific reason the prospect gives for NOT moving forward.
- Must be a stated barrier, not just a concern
- Examples: "We don't have budget", "We're locked into a contract", "I need my CEO to approve"

PAIN POINT (Prospect): A challenge, frustration, or problem the prospect is experiencing.
- Something causing them difficulty in their business/role
- Examples: "Our team wastes 5 hours a week on manual reports", "We keep losing deals to competitors"

PAIN POINT (Rep): A weakness or struggle the salesperson exhibits during the call.
- Poor technique, missed opportunity, or skill gap
- Examples: "Rep talked over the prospect", "Failed to ask follow-up questions"

For each item found, provide:
1. Exact verbatim quote from the transcript
2. Timestamp (start/end)
3. Sales phase where it occurred
4. Rep's response (for objections) with effectiveness rating
5. Clip-worthy rating (1-10) - how valuable for training?
6. Reason if clip-worthy (rating >= 7)

OUTPUT FORMAT:
{
  "objections": [...],
  "prospect_pain_points": [...],
  "rep_pain_points": [...]
}
```

---

## Phase 2: Aggregation & Pattern Recognition

### Purpose
Aggregate extracted data across multiple calls to identify patterns, generate battle cards, and curate best training clips.

### New Service: `InsightAggregationService.ts`

```typescript
interface AggregationInput {
  companyId: number;
  timeframe: "week" | "month" | "quarter" | "all";
  minCalls?: number;  // Minimum calls to consider a pattern (default: 3)
}

interface AggregatedObjection {
  title: string;
  canonicalForm: string;  // Standardized version
  frequency: number;
  trend: "up" | "down" | "stable";
  overcomeRate: number;
  bestClips: TrainingClip[];
  worstClips: TrainingClip[];
  battleCard?: BattleCard;
}

interface TrainingClip {
  interactionId: number;
  salespersonId: number;
  timestamp: { start: string; end: string };
  verbatimQuote: string;
  repResponse: string;
  effectiveness: string;
  rating: number;
}

interface BattleCard {
  strategy: string;
  approach: string[];
  sampleScript: string;
  nextStep: string;
  topPerformerTechniques: string[];
  commonMistakes: string[];
}
```

### Aggregation Process

1. **Gather Raw Data**
   ```typescript
   // Get all extractions for company in timeframe
   const extractions = await db.select()
     .from(interactionObjections)
     .innerJoin(interactions, eq(...))
     .where(and(
       eq(interactions.companyId, companyId),
       gte(interactions.createdAt, startDate)
     ));
   ```

2. **Normalize & Cluster**
   - Use AI to cluster similar objections (e.g., "budget", "too expensive", "no money" → "Budget constraints")
   - Calculate frequency and trends

3. **Calculate Metrics**
   ```typescript
   // For each objection cluster
   const overcomeRate =
     successfulResponses.length / totalOccurrences * 100;

   const trend = calculateTrend(
     occurrencesThisPeriod,
     occurrencesPreviousPeriod
   );
   ```

4. **Curate Training Clips**
   ```typescript
   // Best clips: high effectiveness + high clip_worthy_rating
   const bestClips = clips
     .filter(c => c.effectiveness === "overcame" && c.clipRating >= 7)
     .sort((a, b) => b.clipRating - a.clipRating)
     .slice(0, 5);

   // Worst clips: missed/avoided + instructive
   const worstClips = clips
     .filter(c => ["missed", "avoided"].includes(c.effectiveness))
     .sort((a, b) => b.clipRating - a.clipRating)
     .slice(0, 3);
   ```

5. **Generate Battle Cards** (AI-assisted)
   ```typescript
   // Send top clips + company context to AI
   const battleCard = await generateBattleCard({
     objectionTitle,
     bestResponses: bestClips.map(c => c.repResponse),
     companyContext,
     industryContext,
   });
   ```

### Database Schema for Aggregation

**Note:** We may not need a separate `training_clips` table since `interaction_objections` and `interaction_pain_points` already store all clip data with full traceability. The aggregation phase queries these tables and filters for high clip_worthy_rating.

```sql
-- Battle cards table - links to aggregated objections/pain_points
CREATE TABLE battle_cards (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  objection_id INTEGER REFERENCES objections(id),
  pain_point_id INTEGER REFERENCES pain_points(id),
  strategy TEXT NOT NULL,
  approach JSONB NOT NULL,  -- string[]
  sample_script TEXT NOT NULL,
  next_step TEXT NOT NULL,
  top_performer_techniques JSONB,  -- string[]
  common_mistakes JSONB,  -- string[]
  generated_at TIMESTAMP DEFAULT NOW(),
  last_updated TIMESTAMP DEFAULT NOW(),
  confidence_score DECIMAL(5, 4),
  source_clip_count INTEGER
);

-- OPTIONAL: Curated training clips library (denormalized for fast UI access)
-- This is a VIEW or materialized table of the best clips from interaction_objections/pain_points
CREATE TABLE training_clips (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,

  -- FULL TRACEABILITY: Link back to source
  interaction_id INTEGER REFERENCES interactions(id) ON DELETE CASCADE,
  salesperson_id INTEGER REFERENCES salespeople(id),  -- Denormalized from interaction for fast queries
  interaction_objection_id INTEGER REFERENCES interaction_objections(id),  -- If objection clip
  interaction_pain_point_id INTEGER REFERENCES interaction_pain_points(id),  -- If pain point clip

  -- Clip categorization
  clip_type TEXT NOT NULL,  -- 'objection_handling', 'prospect_pain_discovery', 'rep_pain_example'
  category TEXT NOT NULL,   -- Canonical objection/pain point title (e.g., "Budget constraints")

  -- Clip data (copied from source for fast access)
  timestamp_start TEXT NOT NULL,
  timestamp_end TEXT NOT NULL,
  verbatim_quote TEXT NOT NULL,
  rep_response TEXT,
  effectiveness TEXT,
  clip_rating INTEGER NOT NULL,
  clip_reason TEXT,

  -- Curation flags (set during aggregation)
  is_best_practice BOOLEAN DEFAULT FALSE,  -- Top clips for "what to do"
  is_anti_pattern BOOLEAN DEFAULT FALSE,   -- Instructive clips for "what not to do"

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_training_clips_company_type ON training_clips(company_id, clip_type);
CREATE INDEX idx_training_clips_category ON training_clips(category);
CREATE INDEX idx_training_clips_salesperson ON training_clips(salesperson_id);
CREATE INDEX idx_training_clips_best_practice ON training_clips(company_id, is_best_practice) WHERE is_best_practice = TRUE;
```

### Alternative: Query-Based Approach (No Extra Table)

Instead of a separate `training_clips` table, we can query directly:

```typescript
// Get best objection handling clips for "Budget constraints"
const bestClips = await db
  .select({
    // Clip data
    verbatimQuote: interactionObjections.verbatimQuote,
    timestampStart: interactionObjections.timestampStart,
    timestampEnd: interactionObjections.timestampEnd,
    repResponse: interactionObjections.repResponse,
    effectiveness: interactionObjections.repResponseEffectiveness,
    clipRating: interactionObjections.clipWorthyRating,
    clipReason: interactionObjections.clipReason,

    // Source traceability
    interactionId: interactions.id,
    audioUrl: interactions.audioUrl,
    callDate: interactions.createdAt,
    salespersonId: salespeople.id,
    salespersonName: salespeople.name,
  })
  .from(interactionObjections)
  .innerJoin(interactions, eq(interactionObjections.interactionId, interactions.id))
  .innerJoin(salespeople, eq(interactions.salespersonId, salespeople.id))
  .innerJoin(objections, eq(interactionObjections.objectionId, objections.id))
  .where(and(
    eq(objections.title, "Budget constraints"),
    eq(objections.companyId, companyId),
    gte(interactionObjections.clipWorthyRating, 7),  // Only high-value clips
    eq(interactionObjections.repResponseEffectiveness, "overcame")  // Success stories
  ))
  .orderBy(desc(interactionObjections.clipWorthyRating))
  .limit(5);
```

**Recommendation:** Start with the query-based approach. Only create `training_clips` table if performance becomes an issue with large datasets.

### Aggregation Prompt (Stage 2)

```
You are analyzing aggregated sales call data to identify patterns and generate battle cards.

INPUT DATA:
- Objection/Pain Point: {{TITLE}}
- Total Occurrences: {{COUNT}}
- Overcome Rate: {{RATE}}%
- Best Response Examples: {{BEST_CLIPS}}
- Worst Response Examples: {{WORST_CLIPS}}
- Company Context: {{COMPANY_CONTEXT}}

TASKS:
1. Identify patterns in successful vs unsuccessful responses
2. Generate a battle card with:
   - Strategy (1-2 sentences on approach)
   - Approach steps (3-5 bullet points)
   - Sample script (copy-pasteable response)
   - Next step (what to do after handling)
3. List top performer techniques observed
4. List common mistakes to avoid

OUTPUT FORMAT:
{
  "battle_card": {
    "strategy": "...",
    "approach": ["...", "...", "..."],
    "sample_script": "...",
    "next_step": "..."
  },
  "top_performer_techniques": ["...", "..."],
  "common_mistakes": ["...", "..."],
  "confidence_score": 0.85,
  "pattern_insights": "..."
}
```

---

## Implementation Plan

### Step 1: Schema Migration
1. Create migration for `interaction_objections` and `interaction_pain_points` column additions
2. Create migration for `battle_cards` and `training_clips` tables
3. Run migrations

### Step 2: Call Extraction Service
1. Create `CallExtractionService.ts`
2. Add extraction Zod schemas
3. Integrate with existing analysis pipeline (Option A or B)
4. Update seed data to include extraction examples

### Step 3: Storage Layer
1. Create `interactionExtractions.ts` for storing extracted data
2. Add functions to upsert objections/pain points
3. Add functions to link interactions to objections/pain points

### Step 4: Aggregation Service
1. Create `InsightAggregationService.ts`
2. Implement clustering/normalization logic
3. Implement metrics calculation
4. Implement clip curation

### Step 5: Battle Card Generation
1. Create battle card generation prompts
2. Implement `BattleCardService.ts`
3. Add scheduled regeneration (daily/weekly)

### Step 6: API Endpoints
1. `GET /api/insights/objections` - Aggregated objections with battle cards
2. `GET /api/insights/pain-points` - Aggregated pain points
3. `GET /api/insights/clips` - Training clip library
4. `GET /api/insights/battle-cards/:id` - Single battle card detail
5. `POST /api/insights/regenerate` - Trigger re-aggregation

### Step 7: Frontend Integration
1. Update insights page to show new data
2. Implement battle card display (use lovable as reference)
3. Implement training clip player
4. Add assignment flow for reps

---

## Cost Optimization

### Prompt Caching Strategy
- Extraction runs alongside existing analysis (cache hit)
- Aggregation runs periodically, not per-call
- Battle card generation only when significant new data

### Estimated Token Usage Per Call
| Step | Input Tokens | Output Tokens | Cost (Sonnet) |
|------|--------------|---------------|---------------|
| Combined Analysis | ~8,000 (cached) | ~2,000 | ~$0.03 |
| Extraction | ~800 (cache hit) | ~1,500 | ~$0.02 |
| **Total per call** | | | **~$0.05** |

### Aggregation (Weekly, ~100 calls)
| Step | Input Tokens | Output Tokens | Cost (Sonnet) |
|------|--------------|---------------|---------------|
| Clustering | ~5,000 | ~500 | ~$0.02 |
| Battle Card Gen (x10) | ~20,000 | ~5,000 | ~$0.10 |
| **Total weekly** | | | **~$0.12** |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1: EXTRACTION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Call Upload → Transcription → CachedAnalysisService           │
│                                      │                          │
│                                      ├── Rating                 │
│                                      ├── Flagging               │
│                                      ├── Metadata               │
│                                      ├── Persona                │
│                                      └── NEW: Extraction ───┐   │
│                                                             │   │
│  ┌─────────────────────────────────────────────────────────┘   │
│  │                                                              │
│  ▼                                                              │
│  CallExtractionService                                          │
│  ├── Extract objections (with timestamps, rep response)         │
│  ├── Extract prospect pain points (with capitalization)         │
│  └── Extract rep pain points (with root cause)                  │
│                                                                 │
│  ▼                                                              │
│  Store in: interaction_objections, interaction_pain_points      │
│            (with clip data)                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 2: AGGREGATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Scheduled Job (Daily/Weekly)                                   │
│  │                                                              │
│  ▼                                                              │
│  InsightAggregationService                                      │
│  │                                                              │
│  ├── 1. Gather all extractions for company/timeframe            │
│  │                                                              │
│  ├── 2. Cluster similar objections/pain points                  │
│  │      └── AI-assisted normalization                           │
│  │                                                              │
│  ├── 3. Calculate metrics                                       │
│  │      ├── Frequency                                           │
│  │      ├── Trend (up/down/stable)                              │
│  │      └── Overcome rate                                       │
│  │                                                              │
│  ├── 4. Curate training clips                                   │
│  │      ├── Best practices (overcame + high rating)             │
│  │      └── Anti-patterns (missed + instructive)                │
│  │                                                              │
│  └── 5. Generate/Update battle cards                            │
│         └── AI-generated from top clips + context               │
│                                                                 │
│  ▼                                                              │
│  Store in: objections, pain_points (aggregated)                 │
│            battle_cards, training_clips                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     OUTPUT: INSIGHTS UI                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Insights Dashboard                                             │
│  ├── Top Objections (by phase)                                  │
│  │   ├── Frequency, Trend, Overcome Rate                        │
│  │   └── Click → Objection Detail                               │
│  │                                                              │
│  ├── Top Prospect Pain Points                                   │
│  └── Top Rep Pain Points                                        │
│                                                                 │
│  Objection/Pain Point Detail                                    │
│  ├── Battle Card                                                │
│  │   ├── Strategy                                               │
│  │   ├── Approach steps                                         │
│  │   ├── Sample script (copy)                                   │
│  │   └── "Practice" → Roleplay                                  │
│  │                                                              │
│  ├── Training Clips                                             │
│  │   ├── Best practice examples (audio + transcript)            │
│  │   └── What to avoid (audio + transcript)                     │
│  │                                                              │
│  └── Assign to Team                                             │
│      └── Creates training task for rep                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Approve this plan** - Confirm approach and priorities
2. **Create schema migration** - Add new columns and tables
3. **Implement CallExtractionService** - Core extraction logic
4. **Test with existing calls** - Run extraction on recent interactions
5. **Implement aggregation** - Build pattern recognition
6. **Generate first battle cards** - Test end-to-end flow
