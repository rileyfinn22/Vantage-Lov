# Feature: Battle Card Generation (Agentic Feature)

## Purpose
Generate a **battle card** for a company / account using available company context and AI generation tools, then persist it.

## Inputs
- Company identifier (companyId) and any request payload needed for generation (as provided to the endpoint)
- Optional constraints: format, sections, competitor list, tone, etc.

## Desired Output (JSON)
Return a single JSON object that includes:
- `battleCard` (object): the generated and persisted battle card (or the persisted record)
- `companyContext` (object, optional): only if required for debugging/audit

## Key Rules
- Use tools to fetch company context; do not hallucinate facts.
- If generation requires assumptions, state them explicitly in the trace and keep them minimal.
- Persist the battle card through the provided tool.
- Avoid duplicate battle cards if the workflow specifies reuse semantics.

## Quality Gates
- Clear, actionable structure (sections, bullets).
- No unverifiable claims; source from retrieved context.
- Output must be valid JSON only.
