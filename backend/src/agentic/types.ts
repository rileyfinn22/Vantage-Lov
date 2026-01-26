export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export interface AgenticTraceEvent {
	ts: string; // ISO
	type:
		| "MODEL_RESPONSE"
		| "TOOL_CALL"
		| "TOOL_RESULT"
		| "FINAL_OUTPUT"
		| "ERROR";
	data: Record<string, unknown>;
}

export interface AgenticRunBudgets {
	maxIterations: number;
	maxToolCalls: number;
	maxTimeMs: number;
}

export interface AgenticRunConfig {
	model: string;
	temperature?: number;
	budgets: AgenticRunBudgets;
}

export interface ToolContext {
	workflowStateId: number;
	workflowType: string;
	workflowId: string;
	metadata: Record<string, unknown>;
}

export type ToolHandler = (args: unknown, ctx: ToolContext) => Promise<JsonValue>;

export interface ToolDefinition {
	name: string;
	description: string;
	// JSON schema for Anthropic tool input
	inputSchema: Record<string, unknown>;
	handler: ToolHandler;
}
