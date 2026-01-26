# Feature: Flag Session (Agentic Workflow)

## Purpose
Start or reuse a training **flag session** for a given `flagId` and `salespersonId`.

## Inputs
- `flagId` (number)
- `salespersonId` (number)
- `allowReuse` (boolean)

## Desired Output (JSON)
Return a single JSON object with:
- `agentId` (string)
- `sessionId` (string or number)
- `signedUrl` (string, if applicable)
- `flag` (object): the flag record
- `battleCard` (object, optional)

## Key Rules
- Reuse: If `allowReuse` is true, reuse any in-progress session with a valid agent.
- Do not invent IDs; fetch/create via tools.
- Persist final results so the worker and API clients can retrieve them.
