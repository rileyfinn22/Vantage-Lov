import { logger } from "#/lib/logger";
import type { ToolContext, ToolDefinition, JsonValue, AgenticTraceEvent } from "./types";

export class ToolRegistry {
	private tools: Map<string, ToolDefinition>;

	constructor(tools: ToolDefinition[]) {
		this.tools = new Map(tools.map((t) => [t.name, t]));
	}

	getAnthropicTools(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
		return Array.from(this.tools.values()).map((t) => ({
			name: t.name,
			description: t.description,
			input_schema: t.inputSchema,
		}));
	}

	has(name: string): boolean {
		return this.tools.has(name);
	}

	async execute(name: string, args: unknown, ctx: ToolContext): Promise<{ result: JsonValue; events: AgenticTraceEvent[] }> {
		const tool = this.tools.get(name);
		if (!tool) {
			throw new Error(`Tool not found: ${name}`);
		}

		const startedAt = Date.now();
		const events: AgenticTraceEvent[] = [
			{
				ts: new Date().toISOString(),
				type: "TOOL_CALL",
				data: { tool: name, args },
			},
		];

		try {
			const result = await tool.handler(args, ctx);
			const durationMs = Date.now() - startedAt;

			events.push({
				ts: new Date().toISOString(),
				type: "TOOL_RESULT",
				data: { tool: name, durationMs, result },
			});

			return { result, events };
		} catch (err) {
			const durationMs = Date.now() - startedAt;
			const message = err instanceof Error ? err.message : "Unknown error";
			logger.error({ tool: name, durationMs, error: message }, "Agentic tool failed");
			events.push({
				ts: new Date().toISOString(),
				type: "ERROR",
				data: { tool: name, durationMs, error: message },
			});
			throw err;
		}
	}
}
