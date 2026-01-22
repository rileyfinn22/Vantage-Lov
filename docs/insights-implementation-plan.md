# Insights Flow Implementation Plan

## Executive Summary

This document outlines the step-by-step implementation for Phases 1 & 2 of the Insights Flow: extracting objections/pain points from calls and aggregating them into battle cards.

**Integration Point:** `lookForUnratedInteractionsCached()` in `slopAsker.ts` (lines 383-558)

**Current Pipeline:**
```
Upload → Transcribe → Combined Analysis (rating+metadata+persona) → Flagging → Save
                              ↑ cache write                         ↑ cache hit
```

**New Pipeline:**
```
Upload → Transcribe → Combined Analysis → Flagging → Extraction → Save
                              ↑ write         ↑ hit       ↑ hit (~10% cost)
```

---

## Implementation Steps

### Step 1: Schema Migration

**File:** `backend/src/drizzle/0032_add_extraction_columns.sql`

```sql
-- Add extraction columns to interaction_objections
ALTER TABLE "interaction_objections" ADD COLUMN "verbatim_quote" text;
ALTER TABLE "interaction_objections" ADD COLUMN "timestamp_start" text;
ALTER TABLE "interaction_objections" ADD COLUMN "timestamp_end" text;
ALTER TABLE "interaction_objections" ADD COLUMN "sales_phase" text;
ALTER TABLE "interaction_objections" ADD COLUMN "rep_response" text;
ALTER TABLE "interaction_objections" ADD COLUMN "rep_response_effectiveness" text;
ALTER TABLE "interaction_objections" ADD COLUMN "rep_response_timestamp_start" text;
ALTER TABLE "interaction_objections" ADD COLUMN "rep_response_timestamp_end" text;
ALTER TABLE "interaction_objections" ADD COLUMN "clip_worthy_rating" integer;
ALTER TABLE "interaction_objections" ADD COLUMN "clip_reason" text;

-- Add extraction columns to interaction_pain_points
ALTER TABLE "interaction_pain_points" ADD COLUMN "verbatim_quote" text;
ALTER TABLE "interaction_pain_points" ADD COLUMN "timestamp_start" text;
ALTER TABLE "interaction_pain_points" ADD COLUMN "timestamp_end" text;
ALTER TABLE "interaction_pain_points" ADD COLUMN "sales_phase" text;
ALTER TABLE "interaction_pain_points" ADD COLUMN "pain_type" text;
ALTER TABLE "interaction_pain_points" ADD COLUMN "capitalized_on" boolean;
ALTER TABLE "interaction_pain_points" ADD COLUMN "capitalization_quote" text;
ALTER TABLE "interaction_pain_points" ADD COLUMN "root_cause" text;
ALTER TABLE "interaction_pain_points" ADD COLUMN "clip_worthy_rating" integer;
ALTER TABLE "interaction_pain_points" ADD COLUMN "clip_reason" text;
```

**Update Schema:** `backend/src/data/schema.ts`

```typescript
// Update interactionObjections table
export const interactionObjections = pgTable(
  "interaction_objections",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    interactionId: integer("interaction_id")
      .notNull()
      .references(() => interactions.id, { onDelete: "cascade" }),
    objectionId: integer("objection_id")
      .notNull()
      .references(() => objections.id, { onDelete: "cascade" }),
    wasOvercome: boolean("was_overcome").default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),

    // NEW: Extraction data
    verbatimQuote: text("verbatim_quote"),
    timestampStart: text("timestamp_start"),
    timestampEnd: text("timestamp_end"),
    salesPhase: text("sales_phase"),
    repResponse: text("rep_response"),
    repResponseEffectiveness: text("rep_response_effectiveness"),
    repResponseTimestampStart: text("rep_response_timestamp_start"),
    repResponseTimestampEnd: text("rep_response_timestamp_end"),
    clipWorthyRating: integer("clip_worthy_rating"),
    clipReason: text("clip_reason"),
  },
  (_t) => [],
);

// Update interactionPainPoints table
export const interactionPainPoints = pgTable(
  "interaction_pain_points",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    interactionId: integer("interaction_id")
      .notNull()
      .references(() => interactions.id, { onDelete: "cascade" }),
    painPointId: integer("pain_point_id")
      .notNull()
      .references(() => painPoints.id, { onDelete: "cascade" }),
    wasResolved: boolean("was_resolved").default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),

    // NEW: Extraction data
    verbatimQuote: text("verbatim_quote"),
    timestampStart: text("timestamp_start"),
    timestampEnd: text("timestamp_end"),
    salesPhase: text("sales_phase"),
    painType: text("pain_type"),  // 'prospect_pain' | 'rep_pain'
    capitalizedOn: boolean("capitalized_on"),
    capitalizationQuote: text("capitalization_quote"),
    rootCause: text("root_cause"),
    clipWorthyRating: integer("clip_worthy_rating"),
    clipReason: text("clip_reason"),
  },
  (_t) => [],
);
```

**Commands:**
```bash
# Generate migration
mise r generate

# Apply migration (dev)
mise r migrate
```

---

### Step 2: Create CallExtractionService

**File:** `backend/src/services/CallExtractionService.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { logger } from "#/lib/logger";

// ============================================================================
// SCHEMAS
// ============================================================================

export const ExtractedObjectionSchema = z.object({
  title: z.string(),
  verbatim_quote: z.string(),
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
});

export const ExtractedPainPointSchema = z.object({
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
});

export const ExtractionResponseSchema = z.object({
  objections: z.array(ExtractedObjectionSchema),
  prospect_pain_points: z.array(ExtractedPainPointSchema),
  rep_pain_points: z.array(ExtractedPainPointSchema),
});

export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;

// ============================================================================
// PROMPT
// ============================================================================

export const EXTRACTION_PROMPT = `You are analyzing a sales call transcript to extract specific objections and pain points for training purposes.

## DEFINITIONS

### OBJECTION
A specific reason the prospect gives for NOT moving forward.
- Must be a stated barrier, not just a concern or question
- Examples: "We don't have budget for this", "We're locked into a 2-year contract", "I need my CEO to approve any purchases over $10k"

### PAIN POINT (Prospect)
A challenge, frustration, or problem the prospect is experiencing in their business/role.
- Something causing them difficulty that your product could solve
- Examples: "Our team wastes 5 hours a week on manual reports", "We keep losing deals because we can't respond fast enough"

### PAIN POINT (Rep)
A weakness or struggle the salesperson exhibits during the call.
- Poor technique, missed opportunity, or skill gap
- Examples: "Rep talked over the prospect multiple times", "Failed to ask follow-up questions when prospect mentioned a pain point"

## EXTRACTION REQUIREMENTS

For EACH item found, provide:

1. **title**: Normalized category name (e.g., "Budget constraints" not "They said they don't have money")
2. **verbatim_quote**: Exact words from the transcript (copy-paste, don't paraphrase)
3. **timestamp**: Start and end time of the quote (format: "HH:MM:SS")
4. **sales_phase**: Which phase this occurred in (outreach/discovery/demo/close)
5. **clip_worthy_rating**: 1-10 score for training value
   - 10 = Perfect training example, must include
   - 7-9 = Very good, worth including
   - 4-6 = Decent, include if space
   - 1-3 = Not particularly useful
6. **clip_reason**: If rating >= 7, explain why this is valuable for training

### For OBJECTIONS, also include:
- **rep_response.quote**: How the rep responded (verbatim)
- **rep_response.effectiveness**: overcame | partially_addressed | missed | avoided
- **rep_response.timestamp**: Start/end of rep's response

### For PROSPECT PAIN POINTS, also include:
- **capitalized_on**: Did the rep leverage this pain point? (true/false)
- **capitalization_quote**: If yes, what did they say?

### For REP PAIN POINTS, also include:
- **root_cause**: Why did this happen? (e.g., "Eager to pitch, not actively listening")

## OUTPUT FORMAT

Return valid JSON matching this structure:
{
  "objections": [...],
  "prospect_pain_points": [...],
  "rep_pain_points": [...]
}

If no items found for a category, return an empty array.

## TRANSCRIPT

[See transcript in system message above]`;

// ============================================================================
// SERVICE
// ============================================================================

export class CallExtractionService {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model ?? "claude-sonnet-4-20250514";
  }

  /**
   * Extract objections and pain points from a transcript
   * Designed to be called AFTER combined analysis for cache hit
   */
  async extract(
    cachedSystemContent: Anthropic.Messages.TextBlockParam,
    interactionId?: string,
  ): Promise<ExtractionResponse> {
    logger.info({ interactionId, step: "extraction" }, "Starting extraction analysis");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: [cachedSystemContent],
      messages: [
        {
          role: "user",
          content: EXTRACTION_PROMPT,
        },
      ],
    });

    // Log cache performance
    const usage = response.usage as {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };

    logger.info(
      {
        interactionId,
        model: this.model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      },
      "Extraction API call completed",
    );

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from API");
    }

    // Parse JSON (handle markdown code blocks)
    let text = textBlock.text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      text = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(text);
    const validated = ExtractionResponseSchema.parse(parsed);

    logger.info(
      {
        interactionId,
        objectionCount: validated.objections.length,
        prospectPainCount: validated.prospect_pain_points.length,
        repPainCount: validated.rep_pain_points.length,
      },
      "Completed extraction analysis",
    );

    return validated;
  }
}

// Singleton
let extractionService: CallExtractionService | null = null;

export function getCallExtractionService(): CallExtractionService | null {
  if (!extractionService && process.env.ANTHROPIC_API_KEY) {
    extractionService = new CallExtractionService(process.env.ANTHROPIC_API_KEY);
  }
  return extractionService;
}
```

---

### Step 3: Create Extraction Storage Functions

**File:** `backend/src/services/ExtractionStorageService.ts`

```typescript
import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "#/lib/logger";
import type { ExtractionResponse } from "./CallExtractionService";

/**
 * Find or create an objection by title for a company
 */
export async function findOrCreateObjection(
  companyId: number,
  title: string,
  phase: "outreach" | "discovery" | "demo" | "close",
): Promise<number> {
  // Try to find existing
  const existing = await db
    .select({ id: schema.objections.id })
    .from(schema.objections)
    .where(
      and(
        eq(schema.objections.companyId, companyId),
        eq(schema.objections.title, title),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create new
  const [created] = await db
    .insert(schema.objections)
    .values({
      companyId,
      title,
      description: `Objection: ${title}`, // Will be updated during aggregation
      frequency: 1,
      phase,
      impact: "medium", // Default, updated during aggregation
      trend: "stable",
    })
    .returning({ id: schema.objections.id });

  return created.id;
}

/**
 * Find or create a pain point by title for a company
 */
export async function findOrCreatePainPoint(
  companyId: number,
  title: string,
  phase: "outreach" | "discovery" | "demo" | "close",
  isProspectPain: boolean,
): Promise<number> {
  // Try to find existing
  const existing = await db
    .select({ id: schema.painPoints.id })
    .from(schema.painPoints)
    .where(
      and(
        eq(schema.painPoints.companyId, companyId),
        eq(schema.painPoints.title, title),
        eq(schema.painPoints.isProspectPain, isProspectPain),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create new
  const [created] = await db
    .insert(schema.painPoints)
    .values({
      companyId,
      title,
      description: `Pain point: ${title}`, // Will be updated during aggregation
      frequency: 1,
      phase,
      severity: "major", // Default, updated during aggregation
      isProspectPain,
    })
    .returning({ id: schema.painPoints.id });

  return created.id;
}

/**
 * Save extraction results to database
 */
export async function saveExtractionResults(
  interactionId: number,
  companyId: number,
  extraction: ExtractionResponse,
): Promise<void> {
  logger.info({ interactionId, companyId }, "Saving extraction results");

  // Save objections
  for (const obj of extraction.objections) {
    const objectionId = await findOrCreateObjection(
      companyId,
      obj.title,
      obj.sales_phase,
    );

    await db.insert(schema.interactionObjections).values({
      interactionId,
      objectionId,
      wasOvercome: obj.rep_response.effectiveness === "overcame",
      verbatimQuote: obj.verbatim_quote,
      timestampStart: obj.timestamp.start,
      timestampEnd: obj.timestamp.end,
      salesPhase: obj.sales_phase,
      repResponse: obj.rep_response.quote,
      repResponseEffectiveness: obj.rep_response.effectiveness,
      repResponseTimestampStart: obj.rep_response.timestamp.start,
      repResponseTimestampEnd: obj.rep_response.timestamp.end,
      clipWorthyRating: obj.clip_worthy_rating,
      clipReason: obj.clip_reason,
    });

    // Update frequency on aggregated objection
    await db
      .update(schema.objections)
      .set({
        frequency: db.raw`frequency + 1`,
        totalCallsMentioned: db.raw`COALESCE(total_calls_mentioned, 0) + 1`,
      })
      .where(eq(schema.objections.id, objectionId));
  }

  // Save prospect pain points
  for (const pain of extraction.prospect_pain_points) {
    const painPointId = await findOrCreatePainPoint(
      companyId,
      pain.title,
      pain.sales_phase,
      true, // isProspectPain
    );

    await db.insert(schema.interactionPainPoints).values({
      interactionId,
      painPointId,
      wasResolved: pain.capitalized_on ?? false,
      verbatimQuote: pain.verbatim_quote,
      timestampStart: pain.timestamp.start,
      timestampEnd: pain.timestamp.end,
      salesPhase: pain.sales_phase,
      painType: "prospect_pain",
      capitalizedOn: pain.capitalized_on,
      capitalizationQuote: pain.capitalization_quote,
      clipWorthyRating: pain.clip_worthy_rating,
      clipReason: pain.clip_reason,
    });

    // Update frequency
    await db
      .update(schema.painPoints)
      .set({
        frequency: db.raw`frequency + 1`,
        totalCallsMentioned: db.raw`COALESCE(total_calls_mentioned, 0) + 1`,
      })
      .where(eq(schema.painPoints.id, painPointId));
  }

  // Save rep pain points
  for (const pain of extraction.rep_pain_points) {
    const painPointId = await findOrCreatePainPoint(
      companyId,
      pain.title,
      pain.sales_phase,
      false, // isProspectPain = false (rep pain)
    );

    await db.insert(schema.interactionPainPoints).values({
      interactionId,
      painPointId,
      wasResolved: false,
      verbatimQuote: pain.verbatim_quote,
      timestampStart: pain.timestamp.start,
      timestampEnd: pain.timestamp.end,
      salesPhase: pain.sales_phase,
      painType: "rep_pain",
      rootCause: pain.root_cause,
      clipWorthyRating: pain.clip_worthy_rating,
      clipReason: pain.clip_reason,
    });

    // Update frequency
    await db
      .update(schema.painPoints)
      .set({
        frequency: db.raw`frequency + 1`,
        totalCallsMentioned: db.raw`COALESCE(total_calls_mentioned, 0) + 1`,
      })
      .where(eq(schema.painPoints.id, painPointId));
  }

  logger.info(
    {
      interactionId,
      objectionsSaved: extraction.objections.length,
      prospectPainsSaved: extraction.prospect_pain_points.length,
      repPainsSaved: extraction.rep_pain_points.length,
    },
    "Saved extraction results",
  );
}
```

---

### Step 4: Integrate into Analysis Pipeline

**File:** `backend/src/vantage/slopAsker.ts`

Add extraction call after flagging in `lookForUnratedInteractionsCached()`:

```typescript
// Import at top
import { getCallExtractionService } from "#/services/CallExtractionService";
import { saveExtractionResults } from "#/services/ExtractionStorageService";

// Inside lookForUnratedInteractionsCached(), after flagging results are processed:

// ... existing code for combined analysis and flagging ...

// NEW: Run extraction (3rd API call - cache hit)
const extractionService = getCallExtractionService();
if (extractionService && companyId) {
  try {
    logger.info({ interactionId }, "Starting extraction analysis (cache hit)");

    // Build the same cached system content used by combined/flagging
    const cachedSystemContent: Anthropic.Messages.TextBlockParam = {
      type: "text",
      text: `You are an expert sales performance analyst. Below is a sales call transcript that you will analyze.

## CALL TRANSCRIPT

${textToAnalyze}

---

You will receive specific analysis instructions in the user message. Respond with the requested analysis in valid JSON format.`,
      cache_control: { type: "ephemeral" } as const,
    };

    const extractionResults = await extractionService.extract(
      cachedSystemContent,
      String(interactionId),
    );

    // Save to database
    await saveExtractionResults(interactionId, companyId, extractionResults);

    logger.info(
      {
        interactionId,
        objections: extractionResults.objections.length,
        prospectPains: extractionResults.prospect_pain_points.length,
        repPains: extractionResults.rep_pain_points.length,
      },
      "Completed extraction and saved results",
    );
  } catch (error) {
    logger.error({ interactionId, error }, "Failed extraction - continuing without it");
    // Don't fail the whole pipeline if extraction fails
  }
}

// ... rest of existing code ...
```

---

### Step 5: Add to CachedAnalysisService (Alternative)

If you prefer to keep all analysis in one service, add extraction to `CachedAnalysisService.ts`:

```typescript
// Add to analyzeTranscriptCombined method signature
async analyzeTranscriptCombined(
  transcript: string,
  analyses: {
    combined: { prompt: string; companyContext?: string };
    flagging?: { prompt: string; companyContext?: string };
    extraction?: { enabled: boolean };  // NEW
  },
  interactionId?: string,
)

// Add extraction call after flagging
if (analyses.extraction?.enabled) {
  logger.info({ interactionId, step: "extraction" }, "Starting extraction analysis (cache hit)");
  try {
    const extractionResult = await this.runAnalysis(
      cachedSystemContent,
      EXTRACTION_PROMPT,  // Import from CallExtractionService
      interactionId,
    );
    const parsed = JSON.parse(extractionResult);
    results.extraction = ExtractionResponseSchema.parse(parsed);
    logger.info({
      interactionId,
      objections: results.extraction.objections.length,
      painPoints: results.extraction.prospect_pain_points.length + results.extraction.rep_pain_points.length,
    }, "Completed extraction analysis");
  } catch (error) {
    logger.error({ error, interactionId }, "Failed extraction analysis");
    // Don't throw - extraction is optional
  }
}
```

---

### Step 6: Test with Existing Data

**File:** `backend/src/services/CallExtractionService.test.ts`

```typescript
import { describe, test, expect } from "vitest";
import { CallExtractionService, ExtractionResponseSchema } from "./CallExtractionService";

describe("CallExtractionService", () => {
  test.skip("extracts objections and pain points from sample transcript", async () => {
    // Skip in CI - requires API key
    const service = new CallExtractionService(process.env.ANTHROPIC_API_KEY!);

    const sampleTranscript = `[00:00:15 - 00:00:32] SPEAKER_0: Hi, thanks for taking my call today. I wanted to follow up on our demo last week.
[00:00:33 - 00:00:58] SPEAKER_1: Yeah, I looked at everything. The product looks good but honestly we just don't have the budget for this right now. We're in a spending freeze until Q2.
[00:00:59 - 00:01:24] SPEAKER_0: I totally understand budget constraints. What if we looked at the ROI over 12 months? Most of our clients see payback within the first quarter.
[00:01:25 - 00:01:45] SPEAKER_1: That's interesting. Our team spends about 10 hours a week on manual reporting. It's killing our productivity.`;

    const cachedSystemContent = {
      type: "text" as const,
      text: `You are an expert sales performance analyst. Below is a sales call transcript that you will analyze.

## CALL TRANSCRIPT

${sampleTranscript}

---

You will receive specific analysis instructions in the user message. Respond with the requested analysis in valid JSON format.`,
      cache_control: { type: "ephemeral" } as const,
    };

    const result = await service.extract(cachedSystemContent, "test-1");

    // Validate response structure
    expect(result.objections).toBeDefined();
    expect(result.prospect_pain_points).toBeDefined();
    expect(result.rep_pain_points).toBeDefined();

    // Should find budget objection
    expect(result.objections.length).toBeGreaterThan(0);
    expect(result.objections[0].title.toLowerCase()).toContain("budget");

    // Should find manual reporting pain point
    expect(result.prospect_pain_points.length).toBeGreaterThan(0);
  });
});
```

---

## Phase 2: Aggregation (Future)

Once Phase 1 is working, Phase 2 adds:

1. **InsightAggregationService** - Periodic job to:
   - Query all interaction_objections/pain_points for a company
   - Calculate frequency, trends, overcome rates
   - Identify top clips (clip_worthy_rating >= 7)
   - Update aggregated objections/pain_points tables

2. **BattleCardService** - Generate battle cards from aggregated data:
   - Gather best clips for each objection
   - Send to AI with company context
   - Generate strategy, approach, script, next step
   - Store in new battle_cards table

3. **Scheduling** - Daily/weekly cron job for aggregation

---

## File Checklist

| # | File | Action | Priority |
|---|------|--------|----------|
| 1 | `backend/src/drizzle/0032_add_extraction_columns.sql` | Create | Must |
| 2 | `backend/src/data/schema.ts` | Update tables | Must |
| 3 | `backend/src/services/CallExtractionService.ts` | Create | Must |
| 4 | `backend/src/services/ExtractionStorageService.ts` | Create | Must |
| 5 | `backend/src/vantage/slopAsker.ts` | Add extraction call | Must |
| 6 | `backend/src/services/CallExtractionService.test.ts` | Create | Should |
| 7 | `backend/src/services/InsightAggregationService.ts` | Create | Phase 2 |
| 8 | `backend/src/services/BattleCardService.ts` | Create | Phase 2 |

---

## Cost Estimate

| API Call | Tokens | Cache | Cost |
|----------|--------|-------|------|
| Combined (rating+metadata+persona) | ~10k | Write | ~$0.03 |
| Flagging | ~1k + cache | Hit | ~$0.005 |
| **Extraction** | ~1k + cache | **Hit** | **~$0.005** |
| **Total per call** | | | **~$0.04** |

The extraction adds ~$0.005 per call due to cache hit.

---

## Next Steps

1. **Review this plan** - Confirm approach
2. **Create migration** - Step 1
3. **Update schema** - Step 1
4. **Create CallExtractionService** - Step 2
5. **Create ExtractionStorageService** - Step 3
6. **Integrate into slopAsker.ts** - Step 4
7. **Test with real calls** - Step 5
8. **Deploy and monitor** - Verify data is being captured
