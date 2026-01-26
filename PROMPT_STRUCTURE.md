# Rating and Skills Assessment Prompt Structure ✅ IMPLEMENTED

## Overview

This document outlines the **COMBINED** AI prompt system that generates:
1. **Overall Call Rating** (0-100) with explanation
2. **Skills Assessment** (four skills rated 1-10 each) with reasoning and key moments

**STATUS**: ✅ Fully implemented - single prompt analyzes calls once and returns both rating AND skills assessment.

The combined approach is more efficient and ensures consistency between overall rating and skill scores.

---

## 1. Rating Prompt Structure

### Current Implementation
- **Service**: `RatingService` in `backend/src/vantage/slopAsker.ts`
- **Model**: `google/gemini-2.5-flash` (via Mastra)
- **Output Schema**:
  ```typescript
  {
    rating: number (0-100)
    blurb: string (explanation)
  }
  ```
- **Database**: Stored in `ratings` table

### Enhancement Needed: Company Context Integration

**Current Flow:**
```typescript
const promptText = await getPrompt("rating");
const fullPrompt = `${promptText}\n\n${text}`;
```

**Enhanced Flow (with company context):**
```typescript
const promptText = await getPrompt("rating");

// Load company context if available
let companyContextFormatted: string | undefined;
if (companyId) {
    const companyContext = await CompanyAIContextService.loadCompanyContext(companyId);
    companyContextFormatted = CompanyAIContextService.formatContextForPrompt(companyContext);
}

// Replace placeholders
let fullPrompt = promptText.replace("{{CALL_TRANSCRIPT}}", text);
fullPrompt = fullPrompt.replace("{{COMPANY_CONTEXT}}", companyContextFormatted ?? "");
```

### Rating Prompt Template Structure

The rating prompt should include these sections:

```markdown
# SALES CALL QUALITY RATING

## Your Role
You are an expert sales analyst who rates sales call quality on a 0-100 scale.

## Rating Criteria

### High Quality Calls (80-100)
- Strong discovery questions that uncover pain points
- Effective objection handling aligned with best practices
- Clear value proposition tied to customer needs
- Professional closing techniques
- Excellent rapport building

### Medium Quality Calls (50-79)
- Some discovery but missing key areas
- Objections addressed but not optimally
- Value mentioned but not deeply connected
- Closing attempt made but could be stronger
- Adequate rapport

### Low Quality Calls (0-49)
- Minimal or no discovery
- Objections not handled effectively
- Feature dumping without value connection
- No clear closing or next steps
- Poor rapport or unprofessional behavior

## COMPANY-SPECIFIC CONTEXT

{{COMPANY_CONTEXT}}

Use the company-specific context above to:
- Recognize when reps use top performer techniques from this company
- Identify when reps use company-specific terminology and sales language correctly
- Calibrate ratings against this company's successful patterns
- Compare calls to this company's example good/bad/average calls for benchmarking
- Reward approaches that align with this company's success patterns
- Flag approaches that align with this company's anti-patterns (reduce rating)

**Important**: Rate calls against THIS company's standards, not just generic best practices.

## Your Task

Analyze the following sales call transcript and provide:
1. A rating from 0-100
2. A concise explanation (2-3 sentences) of why you gave this rating

Focus on: discovery quality, objection handling, value articulation, closing effectiveness, and professionalism.

## CALL TRANSCRIPT

{{CALL_TRANSCRIPT}}
```

**Placeholder Replacements:**
- `{{COMPANY_CONTEXT}}` - Replaced with `CompanyAIContextService.formatContextForPrompt()` output
- `{{CALL_TRANSCRIPT}}` - Replaced with actual call transcript text

---

## 2. Skills Assessment Prompt Structure

### New Implementation Needed

**Service to Create**: `SkillsAssessmentService` in `backend/src/vantage/slopAsker.ts`

**Output Schema**:
```typescript
const SkillsAssessmentResponse = z.object({
  skills: z.object({
    objectionHandling: z.object({
      score: z.number().int().min(1).max(10).describe("Objection handling skill (1-10)"),
      reasoning: z.string().describe("Brief explanation of score"),
      examples: z.array(z.string()).describe("Specific examples from the call"),
    }),
    pricingDiscussions: z.object({
      score: z.number().int().min(1).max(10).describe("Pricing discussion skill (1-10)"),
      reasoning: z.string().describe("Brief explanation of score"),
      examples: z.array(z.string()).describe("Specific examples from the call"),
    }),
    discoveryFeatures: z.object({
      score: z.number().int().min(1).max(10).describe("Discovery & features skill (1-10)"),
      reasoning: z.string().describe("Brief explanation of score"),
      examples: z.array(z.string()).describe("Specific examples from the call"),
    }),
    closing: z.object({
      score: z.number().int().min(1).max(10).describe("Closing technique skill (1-10)"),
      reasoning: z.string().describe("Brief explanation of score"),
      examples: z.array(z.string()).describe("Specific examples from the call"),
    }),
  }),
  overallAssessment: z.string().describe("Overall skill assessment summary"),
});
```

**Database Schema Needed**:
```typescript
export const skillsAssessments = pgTable(
  "skills_assessments",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    interactionId: integer("interaction_id")
      .notNull()
      .references(() => interactions.id, { onDelete: "cascade" }),

    // Skills scores (1-10)
    objectionHandlingScore: integer("objection_handling_score").notNull(),
    pricingDiscussionsScore: integer("pricing_discussions_score").notNull(),
    discoveryFeaturesScore: integer("discovery_features_score").notNull(),
    closingScore: integer("closing_score").notNull(),

    // Detailed data (JSONB)
    assessmentData: jsonb("assessment_data").notNull(), // Full response from AI

    createdAt: timestamp("created_at").defaultNow(),
  },
  (_t) => [],
);
```

### Skills Assessment Prompt Template

```markdown
# SALES SKILLS ASSESSMENT

## Your Role
You are an expert sales coach who evaluates specific sales skills from call transcripts.

## Skills to Evaluate

You will rate each of these skills on a 1-10 scale:

### 1. Objection Handling (1-10)
**What to evaluate:**
- Ability to identify and acknowledge objections
- Skill in reframing objections as opportunities
- Use of evidence and examples to address concerns
- Confidence and composure when handling pushback
- Turning objections into deeper discovery

**Rating scale:**
- 1-3: Poor - Avoids objections, becomes defensive, or gives up easily
- 4-6: Average - Addresses objections but misses opportunities to deepen conversation
- 7-8: Good - Handles objections confidently with effective techniques
- 9-10: Excellent - Masters objection handling, uses them to advance the sale

### 2. Pricing Discussions (1-10)
**What to evaluate:**
- Confidence in discussing price and value
- Ability to frame price in context of ROI/value
- Skill in handling price objections
- Avoiding premature discounting
- Using price as a confirmation of value

**Rating scale:**
- 1-3: Poor - Apologetic about price, quick to discount, lacks value articulation
- 4-6: Average - Discusses price but struggles with value connection
- 7-8: Good - Confident pricing discussions tied to value
- 9-10: Excellent - Makes price feel like an investment, masterful value framing

### 3. Discovery & Features (1-10)
**What to evaluate:**
- Quality and depth of discovery questions
- Ability to uncover pain points and priorities
- Skill in presenting features tied to specific needs
- Avoiding feature dumping
- Building a consultative relationship

**Rating scale:**
- 1-3: Poor - Little discovery, heavy feature dumping
- 4-6: Average - Some discovery but features not well connected to needs
- 7-8: Good - Strong discovery with features tied to pain points
- 9-10: Excellent - Deep discovery, perfectly tailored feature presentation

### 4. Closing (1-10)
**What to evaluate:**
- Confidence in asking for the business
- Reading and responding to buying signals
- Creating urgency appropriately
- Handling closing objections
- Securing clear next steps and commitment

**Rating scale:**
- 1-3: Poor - Avoids closing, unclear next steps, no commitment
- 4-6: Average - Attempts close but lacks confidence or technique
- 7-8: Good - Clear closing approach with defined next steps
- 9-10: Excellent - Natural, confident closing that feels consultative

## COMPANY-SPECIFIC CONTEXT

{{COMPANY_CONTEXT}}

Use the company-specific context above to:
- Recognize when reps use this company's top performer techniques (increase scores)
- Identify when reps use company-specific successful objection responses
- Calibrate scores against this company's example calls (good/bad/average)
- Reward use of company terminology and sales language
- Recognize company-specific success patterns in discovery, pricing, and closing
- Flag use of company anti-patterns (reduce scores)

**Important**: Score skills against THIS company's standards and best practices, not just generic sales training.

## Your Task

Analyze the following sales call transcript and:

1. Rate each skill (1-10) based on the criteria above
2. Provide reasoning for each score (2-3 sentences)
3. Include specific examples from the call that support each rating
4. Provide an overall assessment summary

**Format**: Return structured data as specified in the output schema.

## CALL TRANSCRIPT

{{CALL_TRANSCRIPT}}
```

---

## 3. Implementation Checklist

### Step 1: Update Rating Service to Use Company Context
- [ ] Modify `RatingService.rate()` to accept `companyContext` parameter
- [ ] Update rating prompt template with `{{COMPANY_CONTEXT}}` placeholder
- [ ] Update `lookForUnratedInteractions()` to load company context for rating
- [ ] Add rating prompt to database: `INSERT INTO system_prompt_settings (key, value) VALUES ('rating', '<prompt>')`

### Step 2: Create Skills Assessment Service
- [ ] Create `SkillsAssessmentService` class in `slopAsker.ts`
- [ ] Define `SkillsAssessmentResponse` Zod schema
- [ ] Implement `assessSkills(text, interactionId?, companyContext?)` method
- [ ] Use Anthropic Claude (same as flagging for consistency)

### Step 3: Database Schema Changes
- [ ] Add `skills_assessments` table to `schema.ts`
- [ ] Generate migration with `pnpm drizzle-kit generate`
- [ ] Run migration

### Step 4: Integrate into Analysis Pipeline
- [ ] Update `lookForUnratedInteractions()` to:
  - Call skills assessment service
  - Save results to `skills_assessments` table
  - Log assessment completion

### Step 5: Add Prompt to Database
- [ ] Add skills assessment prompt to `system_prompt_settings` table
- [ ] Update `promptSettingKeys` enum to include `skills_assessment`
- [ ] Create seed data for initial prompt

---

## 4. Database Integration Points

### Where Company Context is Loaded

In `lookForUnratedInteractions()` function:

```typescript
for (const interaction of unratedInteractions) {
    const textToAnalyze = computeRawInteractionText(interaction.interactions);
    const interactionId = interaction.interactions.id;
    const companyId = interaction.salespeople?.companyId;

    // Load company-specific AI context if available
    let companyContextFormatted: string | undefined;
    if (companyId) {
        try {
            const companyContext = await CompanyAIContextService.loadCompanyContext(companyId);
            companyContextFormatted = CompanyAIContextService.formatContextForPrompt(companyContext);
            logger.info({ interactionId, companyId }, "Loaded company context");
        } catch (error) {
            logger.warn({ error, interactionId, companyId }, "Failed to load company context");
        }
    }

    // Generate rating WITH company context
    const ratingResponse = await ratingService.rate(textToAnalyze, String(interactionId), companyContextFormatted);

    // Generate flags WITH company context
    const flagResponse = await flaggingService.flag(textToAnalyze, String(interactionId), companyContextFormatted);

    // Generate skills assessment WITH company context
    const skillsResponse = await skillsAssessmentService.assess(textToAnalyze, String(interactionId), companyContextFormatted);

    // Save all to database...
}
```

---

## 5. Expected Output Examples

### Rating Service Output
```json
{
  "rating": 72,
  "blurb": "Call demonstrated good discovery with targeted questions about budget and timeline. Objection handling was adequate but missed an opportunity to dig deeper into the technical concerns. Closing was direct but could have created more urgency."
}
```

### Skills Assessment Service Output
```json
{
  "skills": {
    "objectionHandling": {
      "score": 7,
      "reasoning": "Rep acknowledged the budget objection and reframed it in terms of ROI. Good use of data to support the value proposition.",
      "examples": [
        "When client mentioned budget cuts, rep asked 'What would staying with current solution cost in lost productivity?'",
        "Used case study to demonstrate 3x ROI for similar company"
      ]
    },
    "pricingDiscussions": {
      "score": 6,
      "reasoning": "Rep discussed price confidently but jumped to discount option too quickly without fully exploring value.",
      "examples": [
        "Mentioned flexible payment terms",
        "Offered 15% discount before client asked"
      ]
    },
    "discoveryFeatures": {
      "score": 8,
      "reasoning": "Strong discovery questions uncovered key pain points. Features were well-connected to specific needs identified.",
      "examples": [
        "Asked about current workflow and pain points",
        "Tied automation feature directly to time savings mentioned by client"
      ]
    },
    "closing": {
      "score": 5,
      "reasoning": "Rep asked for next steps but didn't create urgency or secure firm commitment. Close felt uncertain.",
      "examples": [
        "Asked 'Should we schedule implementation call?' but didn't get commitment",
        "Ended with 'Think it over and let me know'"
      ]
    }
  },
  "overallAssessment": "Rep shows strong discovery and good objection handling skills, but needs to improve closing confidence and avoid premature discounting. With more assertive closing and better value articulation during pricing discussions, this rep could move from good to excellent."
}
```

---

## 6. Prompt Storage in Database

All prompts will be stored in the `system_prompt_settings` table with these keys:

- `master` - Base prompt with common instructions (already exists)
- `rating` - Rating-specific prompt (needs to be created)
- `flagging` - Flagging-specific prompt (already exists)
- `skills_assessment` - Skills assessment prompt (needs to be created)

The 3-tier fallback hierarchy will apply:
1. Check for specific prompt (e.g., `skills_assessment`)
2. Fall back to `master` if not found
3. Use hardcoded default if neither exists

---

## Next Steps

Ready to implement! You can now:

1. Create the rating prompt text and add it to the database
2. Create the skills assessment prompt text and add it to the database
3. Update the code to integrate company context into rating
4. Implement the SkillsAssessmentService
5. Add the database schema for skills assessments
6. Integrate skills assessment into the analysis pipeline

All prompts will automatically benefit from company-specific context including:
- Example calls (good/bad/average)
- Success patterns and top performer techniques
- Objection handling approaches that work at this company
- Anti-patterns to avoid
- Company-specific terminology and sales language
