# FEATURE_WORKBENCH_ANALYSIS

## Plain-English Goal
Analyze a sales call transcript provided by the user in the Prompt Workbench. Return structured analysis results for rating, flagging, extraction, and persona.

This is for **testing and iteration** - no database persistence.

## Required Agentic Decomposition

The analysis MUST be performed using the individual analysis tools in sequence:

1) Call `analyze_rating` with the transcript and company context to get:
   - Overall rating (1-100)
   - Skills assessment
   - Call context
   - Red flags

2) Call `analyze_flagging` with the transcript and company context to get:
   - Coaching flags with evidence
   - Revenue impact
   - Better responses

3) Call `analyze_extraction` with the transcript to get:
   - Objections identified
   - Pain points (prospect and rep)
   - Battle card opportunities

4) Call `analyze_persona` with the transcript and flags to get:
   - Prospect persona profile
   - Roleplay prompts for each flag
   - Call summary

## Hard Constraints
- Do NOT persist any results to database
- Use the exact prompts provided (rating, flagging, extraction, persona)
- Return structured JSON matching the expected schemas
- If any step fails, continue with remaining steps and note the failure

## Success Output
Return JSON:
```json
{
  "rating": { ... } | null,
  "flagging": { "flags": [...] } | null,
  "extraction": { ... } | null,
  "personaWithRoleplay": { ... } | null,
  "errors": ["step that failed: reason", ...]
}
```
