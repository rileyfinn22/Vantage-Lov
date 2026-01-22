# System Workflows

This document describes how data flows through Vantage.ai, from call upload to AI analysis to training roleplay.

---

## Overview Diagram

```
                           CALL UPLOAD FLOW
┌─────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│   Upload    │────▶│  Transcription  │────▶│    AI Analysis       │
│ Audio/Video │     │  (ElevenLabs)   │     │ (Anthropic Claude)   │
└─────────────┘     └─────────────────┘     └──────────────────────┘
                                                       │
                    ┌──────────────────────────────────┼──────────────────────────────────┐
                    ▼                                  ▼                                  ▼
            ┌───────────────┐               ┌──────────────────┐               ┌──────────────────┐
            │    Rating     │               │    Flagging      │               │   Extraction     │
            │  + Skills     │               │ + Roleplay Gen   │               │ + Persona        │
            └───────────────┘               └──────────────────┘               └──────────────────┘
                    │                                  │                                  │
                    └──────────────────────────────────┼──────────────────────────────────┘
                                                       ▼
                                           ┌──────────────────────┐
                                           │   Company Brain      │
                                           │ (learned patterns)   │
                                           └──────────────────────┘
                                                       │
                                                       ▼
                                           ┌──────────────────────┐
                                           │  Training/Roleplay   │
                                           │   (ElevenLabs AI)    │
                                           └──────────────────────┘
```

---

## 1. Call Upload & Transcription Flow

**Entry Point:** `POST /api/calls/upload`
**Background Job:** `transcriptProcessor.ts` → `lookForUnprocessedFiles()`

### Steps:

1. **File Upload**
   - User uploads audio (MP3, WAV) or video (MP4, MOV) file
   - File stored in `bigfiles` table with `interactionId` reference
   - Interaction created with `processedStatus: "unprocessed"`

2. **Background Transcript Job** (runs every 10 seconds)
   - Polls for interactions with `processedStatus: "unprocessed"`
   - For video files: extracts audio using FFmpeg (`VideoProcessingService`)
   - Sends audio to ElevenLabs transcription API
   - Receives diarized transcript with speaker labels and timestamps

3. **Transcript Storage**
   - Transcript saved to `interactions.v1_raw_google_diarized`
   - Status updated to `processedStatus: "processed"`
   - Triggers next phase: AI Analysis

### Key Files:
- `backend/src/vantage/transcriptProcessor.ts` - Background job
- `backend/src/services/AudioTranscriptionService.ts` - ElevenLabs wrapper
- `backend/src/services/VideoProcessingService.ts` - FFmpeg audio extraction

---

## 2. AI Analysis Flow (Cached Analysis)

**Background Job:** `slopAsker.ts` → `lookForUnratedInteractions()`
**Service:** `CachedAnalysisService.ts`

### Prompt Caching Strategy

Uses Anthropic's prompt caching to save ~50-60% on tokens:
- **1st call (Rating):** Cache write - pays full price for transcript
- **2nd-4th calls:** Cache hits - pay 10% for transcript

### Analysis Pipeline (4 API Calls)

```
STEP 1: Rating (cache write)
    │
    ▼
STEP 2: Flagging + Extraction (parallel, cache hits)
    │
    ▼
STEP 3: Persona + Roleplay Generation (cache hit, needs flags from step 2)
```

### Step 1: Rating Analysis
- **Input:** Transcript + Company Brain context
- **Output:**
  - Overall rating (1-100)
  - Skills assessment (objection handling, pricing, discovery, closing)
  - Call context (type, stage, objective)
  - Red flags, top strength, priority improvement

### Step 2a: Flagging Analysis
- **Input:** Transcript + Company Brain context
- **Output:** Coaching flags with:
  - Flag title and confidence score
  - What happened (prospect said, rep said)
  - Revenue impact
  - Better response suggestions
  - Timestamps

### Step 2b: Extraction Analysis (parallel with flagging)
- **Input:** Transcript
- **Output:**
  - Objections raised
  - Prospect pain points
  - Rep pain points
  - Potential battle card content

### Step 3: Persona + Roleplay Generation
- **Input:** Transcript + Flags from Step 2
- **Output:**
  - Psychological persona (name, role, speaking style, etc.)
  - Call summary (overview, topics, outcome, next steps)
  - Pre-generated roleplay prompts for each flag (eliminates per-flag API calls)

### Data Storage
- **ratings** table: Overall score and blurb
- **skills_assessments** table: Individual skill scores
- **flags** table: Each coaching flag with `agentPrompt` (roleplay config)
- **call_personas** table: Extracted persona for training lookup
- **objections** table: Extracted objections
- **pain_points** table: Prospect and rep pain points
- **interactions.metadata**: Prospect info and call summary

### Key Files:
- `backend/src/vantage/slopAsker.ts` - Background job orchestration
- `backend/src/services/CachedAnalysisService.ts` - Anthropic API with caching
- `backend/src/services/CompanyAIContextService.ts` - Loads company brain
- `backend/src/services/ExtractionStorageService.ts` - Saves extraction results

---

## 3. Company Brain (Knowledge System)

**Service:** `CompanyAIContextService.ts`

The "Company Brain" is company-specific context injected into all AI prompts. It learns from:

### Data Sources

1. **Company Training Data** (`company_training_data` table)
   - Onboarding documents
   - Product positioning
   - Objection handling guide
   - Competitor info
   - Company values
   - Target customer profile
   - Sales methodology
   - Company FAQ

2. **Learned Patterns** (`company_ai_context` table)
   - `sales_language`: Common phrases, product terms
   - `objection_patterns`: Successful responses
   - `success_patterns`: Top performer techniques
   - `anti_patterns`: What to avoid (low-rated behaviors)
   - `terminology`: Glossary, product names
   - `flag_quality_patterns`: Good vs bad flags (from feedback)
   - `better_responses`: Coach-recommended responses
   - `top_performer_patterns`: What star reps do
   - `bottom_performer_patterns`: Common mistakes
   - `skill_gap_patterns`: Team weak areas

### Context Filtering

Context is filtered by call type to reduce noise:
- **Discovery calls** → outreach + discovery patterns
- **Demo calls** → discovery + demo patterns
- **Negotiation calls** → demo + close patterns
- **Closing calls** → close patterns

### Key Files:
- `backend/src/services/CompanyAIContextService.ts` - Load and format context
- `backend/src/services/CalibrationService.ts` - Extract patterns from example calls
- `backend/src/services/FeedbackAggregationService.ts` - Learn from feedback

---

## 4. Voice Roleplay Training Flow

**Service:** `elevenlabsConversational.ts`
**Routes:** `backend/src/api/training/routes.ts`

### Two Training Types

#### A. Flag-Based Training (practice specific mistakes)
1. Flag identified during analysis with pre-generated roleplay prompt
2. User clicks "Practice" on a flag
3. System retrieves stored `agentPrompt` from flag
4. Creates ElevenLabs agent with persona's system prompt
5. Returns signed WebSocket URL for voice conversation
6. User practices with AI prospect in real-time
7. Session marked complete, stored for review

#### B. Scenario-Based Training (skills or battle cards)
1. Scenarios created from skills assessments or battle cards
2. User selects a training scenario
3. `PersonaGenerationService` synthesizes persona from:
   - Call personas library (real prospects from past calls)
   - Scenario context and difficulty
   - Company brain knowledge
4. Creates ElevenLabs agent
5. User practices via voice
6. Session completion tracked

### ElevenLabs Agent Configuration
```typescript
{
  prompt: systemPrompt,        // AI prospect's personality and behavior
  firstMessage: string,        // What prospect says first
  llm: "gemini-2.0-flash-lite", // Fast LLM for low latency
  voiceId: string,             // Voice characteristics
  maxDurationSeconds: 900,     // 15 minute limit
  optimizeStreamingLatency: 4  // Maximum latency optimization
}
```

### Session Flow
```
┌─────────────┐     ┌───────────────────┐     ┌──────────────────┐
│ Start       │────▶│ Create/Reuse      │────▶│ Get Signed URL   │
│ Session     │     │ ElevenLabs Agent  │     │ for WebSocket    │
└─────────────┘     └───────────────────┘     └──────────────────┘
                                                       │
                                                       ▼
                                           ┌──────────────────────┐
                                           │ Real-time Voice      │
                                           │ Conversation         │
                                           │ (WebSocket)          │
                                           └──────────────────────┘
                                                       │
                                                       ▼
┌─────────────┐     ┌───────────────────┐     ┌──────────────────┐
│ Session     │◀────│ Store Results     │◀────│ Complete         │
│ Review      │     │ (score, duration) │     │ Session          │
└─────────────┘     └───────────────────┘     └──────────────────┘
```

### Key Files:
- `backend/src/vantage/elevenlabsConversational.ts` - ElevenLabs API wrapper
- `backend/src/api/training/routes.ts` - Training API endpoints
- `backend/src/services/PersonaGenerationService.ts` - Scenario personas
- `backend/src/services/RoleplayPersonaGeneratorService.ts` - Flag personas

---

## 5. Background Job Architecture

**Entry Point:** `backend/src/node.ts`

### Jobs Running

| Job | Interval | Function | Purpose |
|-----|----------|----------|---------|
| Transcript | 10 sec | `lookForUnprocessedFiles()` | Process uploaded audio/video |
| Rating | 2 sec | `lookForUnratedInteractions()` | Run AI analysis pipeline |

### Stale Recovery

If a job crashes mid-processing, interactions can get stuck in "processing" state. Recovery logic resets interactions stuck for >10 minutes.

### Disabling Jobs

Set `START_LOOK_JOBS=false` environment variable to disable background processing.

---

## 6. Prompt Management

### Prompt Storage

Prompts are stored in the `prompts` database table with keys:

| Key | Purpose |
|-----|---------|
| `rating` | Call quality rating + skills assessment |
| `flagging` | Coaching flag identification |
| `extraction` | Objection/pain point extraction |
| `call_persona` | Persona extraction from every call |
| `training_flag` | Flag-based roleplay persona |
| `training_skills` | Skills-based roleplay persona |
| `training_battle_card` | Battle card roleplay persona |
| `training_roleplay` | Meta-prompt for roleplay generation |

### Prompt Templates

Located in `backend/src/lib/prompt/`:
- `v1/trainingFlag.ts` - Flag roleplay prompts
- `v1/trainingSkills.ts` - Skills roleplay prompts
- `v1/trainingBattleCard.ts` - Battle card roleplay prompts
- `v1/trainingRoleplay.ts` - Roleplay meta-prompt
- `analysis-defaults.ts` - Default analysis prompts

### Placeholder Substitution

Prompts use placeholders:
- `{{CALL_TRANSCRIPT}}` - The call transcript
- `{{COMPANY_CONTEXT}}` - Company brain data

---

## 7. Battle Card Generation

**Service:** `BattleCardGenerationService.ts`

Battle cards are auto-generated training scenarios based on extracted objections and patterns.

### Trigger
- Runs after every 2 processed calls per company
- Can also be triggered manually via admin

### Generation Process
1. Aggregate objections from recent calls
2. Identify patterns and common scenarios
3. Generate structured battle card with:
   - Objection category
   - Competitor context
   - Recommended responses
   - Practice scenarios

### Linking
- Battle cards link to training scenarios via `linkedScenarioId`
- Completing a scenario also completes linked battle card assignments

---

## Data Flow Summary

```
UPLOAD → TRANSCRIBE → ANALYZE → STORE → TRAIN

1. Audio/Video uploaded
2. ElevenLabs transcribes with diarization
3. Claude analyzes (4 cached API calls):
   - Rating + skills
   - Flags + roleplay prompts
   - Extraction (objections, pains)
   - Persona + call summary
4. Results stored in database
5. Training available:
   - Flag-based: Practice specific mistakes
   - Scenario-based: Practice skills with synthesized personas
6. ElevenLabs provides real-time voice AI for roleplay
7. Session results tracked for progress monitoring
```

---

## Key Integration Points

### External Services

| Service | Purpose | Config |
|---------|---------|--------|
| Anthropic Claude | AI analysis, prompt caching | `ANTHROPIC_API_KEY` |
| ElevenLabs | Transcription, voice AI | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |

### Database Tables (Core Flow)

| Table | Purpose |
|-------|---------|
| `interactions` | Uploaded calls with transcripts |
| `bigfiles` | Audio/video file references |
| `ratings` | Call quality scores |
| `skills_assessments` | Individual skill scores |
| `flags` | Coaching flags with roleplay prompts |
| `call_personas` | Extracted prospect personas |
| `objections` | Extracted objections |
| `pain_points` | Prospect and rep pain points |
| `training_scenarios` | Practice scenarios |
| `training_sessions_completed` | Completed roleplay sessions |
| `battle_cards` | Generated battle cards |
| `company_ai_context` | Learned company patterns |
| `company_training_data` | Company knowledge base |

---

*Last Updated: January 2026*
