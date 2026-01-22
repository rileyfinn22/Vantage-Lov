# Developer Handoff Document

**Project:** Vantage.ai - Sales Call Analysis Platform
**Last Updated:** January 2026
**Branch:** `extraction`

---

## Overview

Vantage.ai analyzes sales calls to provide coaching insights and training scenarios for salespeople. The system transcribes calls, extracts insights (objections, pain points, flags), rates performance, and generates AI-powered roleplay training.

**Tech Stack:**
- **Frontend:** React, TailwindCSS, DaisyUI, React Query, Nanostores
- **Backend:** Node.js, Hono, Drizzle ORM
- **AI:** Anthropic Claude (with prompt caching), ElevenLabs (transcription + conversational AI)
- **Database:** PostgreSQL (PGlite for local dev)
- **Task Runner:** Mise

---

## Known Technical Debt

### Critical Issues

#### 1. Database Row-Level Security (RLS) Disabled
**File:** `backend/src/drizzle/0046_add_rls_policies.sql.skip`

The RLS migration is skipped, meaning multi-tenant data isolation relies entirely on application code. If the authorization middleware is bypassed, users could access other companies' data.

**Current State:** Application-level checks in `middleware/authorization.ts`
**Risk:** High - security vulnerability if middleware is bypassed
**Fix:** Enable and test the RLS migration, or document why it's intentionally disabled

#### 2. Skipped Training Session Migrations
**Files:**
- `0027_training_sessions_completed.sql.skip`
- `0042_add_training_session_columns.sql.skip`
- `0043_fix_training_sessions_constraint.sql.skip`

These migrations add training session tracking. Code may reference these tables/columns that don't exist in the actual database.

**Action:** Either enable these migrations or remove code that depends on them

#### 3. Hardcoded Salesperson IDs
**File:** `frontend/src/routes/insights/components/BattleCard.tsx:44-45`
```typescript
// TODO: Replace with actual salesperson ID from context
navigate(`/salesperson/1/training/${scenarioId}`);
```

**File:** `backend/src/api/dashboard/routes.ts:10-11`
```typescript
// TODO AH: Replace with actual star salesperson
star: salespeopleWithRatings?.[0],
```

---

### High Priority Refactoring

#### 4. Consolidate Persona Generation Services
Two services with overlapping functionality:
- `PersonaGenerationService.ts` (808 lines) - Skill-based personas
- `RoleplayPersonaGeneratorService.ts` (678 lines) - Flag-based personas

**Problem:** Duplicate AI call patterns, similar prompt building, confusing separation of concerns

**Recommendation:** Either merge into one service with clear entry points, or document the distinct use cases

#### 5. Break Down FeedbackAggregationService
**File:** `backend/src/services/FeedbackAggregationService.ts` (1,287 lines)

This service handles too many responsibilities:
- Pattern extraction
- Success/anti-pattern identification
- Training example generation
- Feedback processing

**Recommendation:** Split into:
- `PatternExtractionService`
- `FeedbackProcessor`
- `TrainingExampleGenerator`

#### 6. Stubbed Dashboard Revenue Function
**File:** `backend/src/vantage/dashboard.ts:146-148`
```typescript
export async function dashboardRevenueData(_userId: string) {
    // TODO AW: Implement revenue fetching logic
}
```

Either implement or remove this dead code.

---

### Medium Priority Issues

#### 7. Debug Logging in Production Code
**File:** `backend/src/api/flags/routes.ts:101-107`
```typescript
console.log("flagsWithInteractions:", JSON.stringify(...));
console.log("transformed flags:", JSON.stringify(...));
```

Replace with `logger.debug()` or remove.

**Also affects:** `FeedbackAggregationService.ts` has ~17 `console.log` statements throughout

#### 8. Type Safety Compromises
**File:** `backend/src/api/admin/crud.ts`

The generic CRUD handler uses `any` extensively for dynamic table operations:
```typescript
const tables: Record<string, any> = {};
const result = (await db.insert(table).values(body).returning()) as any[];
```

**Tradeoff:** Flexibility vs type safety. Document this is intentional.

#### 9. Deprecated Code Still in Use
**File:** `backend/src/services/RoleplayPersonaGeneratorService.ts`
- Line 136: `voiceCharacteristics` marked deprecated but still in interfaces
- Line 360: `generateFromFlag()` marked deprecated but likely still called

**Action:** Complete the deprecation or remove the warnings

#### 10. Silent Error Handling in Background Jobs
**File:** `backend/src/vantage/slopAsker.ts:530`
```typescript
autoGenerateBattleCardsForCompany(companyId).catch((error) => {
    // Silent catch - errors not logged
});
```

Same pattern in `api/insights/routes.ts:46`

**Fix:** Add proper error logging for failed async operations

---

### Low Priority / Code Quality

#### 11. Duplicate Query Code
**File:** `backend/src/vantage/dashboard.ts:74-143`

Two nearly identical database queries in `dashboardData()` function. Extract to helper function.

#### 12. Skipped Test
**File:** `backend/src/services/FileUploadService.test.ts:118`
```typescript
it.skip("should handle errors gracefully with invalid credentials", async () => {
```

Either fix the test or remove it with explanation.

#### 13. CallExtractionService Architecture
**File:** `backend/src/services/CallExtractionService.ts`

Contains only type definitions - the actual service was merged into `CachedAnalysisService`. The file comment explains this but it's confusing.

**Action:** Consider renaming to `CallExtractionTypes.ts` or moving types elsewhere

---

## Hacky Workarounds to Fix

### 1. FormData Type Casting
**File:** `backend/src/services/AudioTranscriptionService.ts:21`
```typescript
for (const [key, value] of requestData as any) {
```

**Why:** TypeScript doesn't recognize FormData as iterable
**Fix:** Use `Array.from(requestData.entries())` or proper typing

### 2. Database Migration Type Cast
**File:** `backend/src/data/index.ts:32`
```typescript
await migrate(db as any, { migrationsFolder: "./src/drizzle" });
```

**Why:** Drizzle types don't align perfectly
**Fix:** Update Drizzle or add proper type assertion

### 3. Voice Selection Placeholder
**File:** `backend/src/services/PersonaGenerationService.ts:793-795`
```typescript
// Select voice based on prospect gender/personality (simplified for now)
// In a real implementation, you might want to have voice IDs configured per scenario
const voiceId = AI.ELEVENLABS.ALT_VOICE_ID;
```

**Why:** No voice selection logic implemented
**Fix:** Add proper voice selection based on persona characteristics

### 4. Instrumentation Disabled
**File:** `backend/src/instrumentation.ts`

OpenTelemetry tracing setup is commented out. Either enable it or remove the dead code.

---

## Architecture Decisions to Document

### 1. Prompt Caching Strategy
`CachedAnalysisService` uses Anthropic's prompt caching to analyze transcripts efficiently:
- Transcript cached in system message (first call pays full price)
- Each analysis type (rating, flagging, extraction, persona) sends only its prompt
- Saves ~50-60% on input tokens across 4 analysis calls

### 2. Background Job Processing
Two polling jobs run on the backend (`node.ts`):
- **Transcript Job:** Looks for unprocessed files every 10 seconds
- **Rating Job:** Looks for unrated interactions every 2 seconds

These use a "stale interaction recovery" pattern - if an interaction is stuck in "processing" for >10 minutes, it gets reset.

### 3. Multi-Tenant Isolation
Currently application-level only (no database RLS):
- `middleware/authorization.ts` checks company_id on requests
- All queries should filter by company
- Risk: relies on developers remembering to add filters

### 4. Prompt Management
Prompts are stored in database (`prompts` table) with keys like:
- `call_rating` - Overall call analysis
- `call_flagging` - Flag identification
- `call_extraction` - Insight extraction
- `call_persona` - Persona generation for roleplay

Legacy keys (`training_scenario`, `flag_persona`) were renamed.

---

## Suggested Next Steps

### Immediate (Before Production)
1. **Security Review:** Decide on RLS - enable it or document why not
2. **Fix Hardcoded IDs:** Salesperson navigation, star performer selection
3. **Enable Training Migrations:** Or remove dependent code
4. **Replace console.log:** Use structured logging throughout

### Short Term (1-2 Sprints)
5. **Consolidate Persona Services:** Clear separation or merge
6. **Break Down FeedbackAggregationService:** Too large for maintainability
7. **Add Error Logging:** Background jobs need visibility
8. **Test Coverage:** Fix or remove skipped tests

### Medium Term (Technical Investment)
9. **Type Safety Pass:** Reduce `any` usage in CRUD and other areas
10. **Documentation:** Architecture decision records for major patterns
11. **Observability:** Enable OpenTelemetry tracing
12. **Voice Selection:** Implement proper voice matching for personas

### Nice to Have
13. **Frontend API Client:** Ensure all fetch calls use typed client
14. **Query Deduplication:** Dashboard and other repeated patterns
15. **Deprecation Cleanup:** Remove old code marked deprecated

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Main server entry | `backend/src/node.ts` |
| API routes index | `backend/src/index.tsx` |
| Database schema | `backend/src/data/schema.ts` |
| Central config | `backend/src/config.ts` |
| Background processor | `backend/src/vantage/slopAsker.ts` |
| AI analysis | `backend/src/services/CachedAnalysisService.ts` |
| Authorization | `backend/src/middleware/authorization.ts` |
| Prompt templates | `backend/src/lib/prompt/` |
| Seed data | `backend/utils/seed.ts` |

---

## Running the Project

```bash
# Install dependencies
mise run install

# Start development server (frontend + backend)
mise run build_and_serve

# Run tests
mise run check:ci:test

# Type check
pnpm -C backend tsc -b --noEmit
pnpm -C frontend tsc -b --noEmit

# Regenerate API types after backend changes
mise run honotypes
```

---

## Questions for Previous Developers

1. Why is RLS disabled? Security concern or performance issue?
2. Are the training session migrations needed? What features depend on them?
3. Is `dashboardRevenueData` planned or should it be removed?
4. What's the intended distinction between PersonaGenerationService and RoleplayPersonaGeneratorService?
5. Why is OpenTelemetry instrumentation disabled?

---

*This document should be updated as technical debt is addressed or new issues are discovered.*
