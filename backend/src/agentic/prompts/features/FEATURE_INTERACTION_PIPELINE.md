# FEATURE_INTERACTION_PIPELINE

## Plain-English Goal
Process a single uploaded/recorded sales interaction end-to-end.

This pipeline MUST:
- Retrieve the interaction transcript and relevant metadata.
- Load the company context ("brain") when available.
- Load the current prompt variants (DB overrides + fallbacks).
- Run the branched cached analysis:
  - Rating
  - Flagging
  - Extraction (including battle-card style fields if present in this repo’s extraction schema)
  - Persona plus roleplay prompts (when available)
- Persist all results to the database the same way the existing pipeline does.

## Required Agentic Decomposition (No Monolithic Tools)
You MUST implement this feature by calling MULTIPLE functional tools, not a single "do everything" tool.

The plan should follow this structure:
1) Call `load_interaction_context` to obtain `{ textToAnalyze, companyId, salespersonId, companyContextFormatted }`.
2) Call `load_analysis_prompts` to obtain the four prompt variants.
3) Call `run_branched_analysis` with the transcript text, optional company context, and prompts.
4) Persist results using the dedicated persistence tools:
   - `persist_rating` (if rating exists)
   - `persist_flags` (if flags exist)
   - `persist_extraction` (if extraction exists and companyId exists)
   - `persist_persona` (if persona exists and companyId exists)

If any earlier step fails, stop immediately and return an error JSON (no partial writes unless explicitly required).

## Hard Constraints
- Do not invent IDs or fabricate transcript content.
- Use allowlisted tools only.
- Do not call persistence tools unless you have valid outputs from `run_branched_analysis`.
- Respect budgets (iterations/tool calls/time). If you cannot complete within budget, return a partial failure with notes.
- Ensure persistence happens before finishing successfully.

## Success Output
Return JSON:
- ok: boolean
- interactionId: number
- saved:
  - rating: boolean
  - flags: number
  - extraction: boolean
  - persona: boolean
- notes: short string
