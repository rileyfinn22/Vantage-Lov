# Feature: Scenario Session (Agentic Workflow)

## Purpose
Start or reuse a training **scenario session** for a given `scenarioId` and `salespersonId`. The outcome is a usable interactive session for training.

## Inputs
- `scenarioId` (number or string)
- `salespersonId` (number)
- `allowReuse` (boolean)
- Workflow metadata may contain additional identifiers required by tools.

## Desired Output (JSON)
Return a single JSON object with:
- `agentId` (string): ElevenLabs agent identifier
- `sessionId` (string or number): training session record identifier
- `signedUrl` (string): signed URL for the agent/session (when applicable)
- `scenario` (object): the scenario record
- `battleCard` (object, optional): include if available/required

## Key Rules
- Reuse: If `allowReuse` is true, prefer reusing an in-progress session that already has a valid `agentId`.
- Do not invent IDs. Use tools to fetch/create records.
- Minimize tool calls; only call what is needed.
- Persist workflow results through the appropriate persistence tool.

## Quality Gates
- Output must match the schema above.
- If reuse is requested and possible, do not create a new agent/session.
- Include enough context in the trace so a developer can audit why reuse vs create happened.
