# Feature: Weekly Battle Cards Generation (Agentic Feature)

## Purpose
Generate a batch of battle cards on a recurring/weekly basis, based on recent signals such as objections, pain points, or other insights.

## Inputs
- `companyId` (if applicable)
- batch parameters from the scheduler/service call (time window, max items, etc.)

## Desired Output (JSON)
Return:
- `created` (number): count of battle cards created
- `updated` (number): count updated (if applicable)
- `items` (array): brief references/ids to created artifacts (optional)

## Key Rules
- Use tools to discover inputs and retrieve source evidence; do not hallucinate.
- Prefer idempotent behavior across runs (do not create duplicates if already created for same signal).
- Persist outputs via tools.
