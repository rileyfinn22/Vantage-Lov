# Agentic Workflow Platform Coverage

This repo includes a bounded agentic orchestration layer under `backend/src/agentic/` and two integration surfaces:

1. **Workflow engine integration** (DB-backed async workflows)
   - Supported workflow types: `scenario_session`, `flag_session`
   - Enable by setting `workflow_state.metadata.agentic = true` (API query param `agentic=true` on the existing start-session endpoints)

2. **Feature-level agentic orchestration** (synchronous API flows)
   - Battle cards weekly generation (`POST /api/battle-cards/generate?agentic=true`)
   - Company calibration (`POST /api/admin/company-training/:companyId/calibrate?agentic=true`)

The feature-level surface intentionally reuses the same agent runtime primitives (tool allowlists, budgets, tracing) while keeping the existing deterministic code paths as the default.

## Budgets

Both workflow and feature agentic modes accept `maxIterations` (bounded to 3–20) via query param.

## Tooling

Feature tools live in `backend/src/agentic/features/`.
