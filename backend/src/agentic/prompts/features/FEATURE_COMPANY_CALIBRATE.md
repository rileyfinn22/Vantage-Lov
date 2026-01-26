# Feature: Company Calibration (Agentic Feature)

## Purpose
Run **company training calibration** for a given `companyId`. This typically produces or updates configuration, rubrics, prompts, and/or model context used elsewhere in training.

## Inputs
- `companyId`
- Any calibration payload from the admin endpoint (if provided)

## Desired Output (JSON)
Return a single JSON object that includes:
- `calibration` (object): calibration result summary (what was created/updated)
- `status` (string): e.g., "ok"
- `notes` (array of strings, optional): key actions taken

## Key Rules
- Use tools to read current company state/config before writing changes.
- Make changes idempotent where possible.
- Persist updates through the provided tools only.
- Be explicit in the trace about what changed and why.

## Quality Gates
- Output is valid JSON.
- Changes are consistent with retrieved company context and policies.
