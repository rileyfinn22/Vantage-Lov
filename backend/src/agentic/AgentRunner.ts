import { getAnthropicClient } from "#/lib/anthropic";
import { logger } from "#/lib/logger";
import type { ToolContext, AgenticRunConfig, AgenticTraceEvent, JsonValue } from "./types";
import { ToolRegistry } from "./ToolRegistry";

// Minimal content block types (Anthropic SDK typing is permissive but we keep it explicit)
type ContentBlock =
	| { type: "text"; text: string }
	| { type: "tool_use"; id: string; name: string; input: unknown };

type Message = { role: "user" | "assistant"; content: Array<ContentBlock | { type: "tool_result"; tool_use_id: string; content: string }> };

function extractText(blocks: any[]): string {
	return (blocks || [])
		.filter((b) => b && b.type === "text" && typeof b.text === "string")
		.map((b) => b.text)
		.join("\n");
}

function safeJsonParse(s: string): unknown | null {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

export class AgentRunner {
	static async run(params: {
		config: AgenticRunConfig;
		toolRegistry: ToolRegistry;
		ctx: ToolContext;
		system: string;
		userPrompt: string;
	}): Promise<{ output: JsonValue; trace: AgenticTraceEvent[] }> {
		const { config, toolRegistry, ctx, system, userPrompt } = params;
		const anthropic = getAnthropicClient();

		const trace: AgenticTraceEvent[] = [];
		const startedAt = Date.now();
		let toolCalls = 0;

		const messages: Message[] = [{ role: "user", content: [{ type: "text", text: userPrompt }] }];

		for (let iteration = 1; iteration <= config.budgets.maxIterations; iteration++) {
			if (Date.now() - startedAt > config.budgets.maxTimeMs) {
				throw new Error("Agentic run exceeded maxTimeMs budget");
			}

			const response = await anthropic.messages.create({
				model: config.model,
				temperature: config.temperature ?? 0.2,
				max_tokens: 1200,
				system,
				messages: messages as any,
				tools: toolRegistry.getAnthropicTools() as any,
			});

			trace.push({
				ts: new Date().toISOString(),
				type: "MODEL_RESPONSE",
				data: {
					iteration,
					stopReason: (response as any).stop_reason ?? null,
					usage: (response as any).usage ?? null,
					textPreview: extractText((response as any).content ?? []).slice(0, 500),
				},
			});

			const content: ContentBlock[] = ((response as any).content ?? []) as any;
			const toolUses = content.filter((b) => b.type === "tool_use") as Array<{ type: "tool_use"; id: string; name: string; input: unknown }>;

			// If the model requested tool calls, execute them and continue
			if (toolUses.length > 0) {
				for (const tu of toolUses) {
					toolCalls += 1;
					if (toolCalls > config.budgets.maxToolCalls) {
						throw new Error("Agentic run exceeded maxToolCalls budget");
					}
					if (!toolRegistry.has(tu.name)) {
						throw new Error(`Tool not allowed: ${tu.name}`);
					}

					const { result, events } = await toolRegistry.execute(tu.name, tu.input, ctx);
					trace.push(...events);

					// Feed tool result back to model
					messages.push({
						role: "assistant",
						content: [{ type: "tool_use", id: tu.id, name: tu.name, input: tu.input }],
					});
					messages.push({
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: tu.id,
								content: JSON.stringify(result ?? null),
							},
						],
					});
				}
				continue;
			}

			// Otherwise, expect final JSON output
			const finalText = extractText(content);
			const extracted = AgentRunner.extractFinalJson(finalText);
			const parsed = safeJsonParse(extracted);

			if (!parsed || typeof parsed !== "object") {
				logger.warn({ iteration, finalTextPreview: finalText.slice(0, 800) }, "Agent did not return parseable final JSON");
				// Ask the model once more to output strict JSON
				messages.push({ role: "assistant", content });
				messages.push({
					role: "user",
					content: [
						{
							type: "text",
							text: "Return ONLY valid JSON for the final output. No prose, no code fences.",
						},
					],
				});
				continue;
			}

			trace.push({
				ts: new Date().toISOString(),
				type: "FINAL_OUTPUT",
				data: { iteration, output: parsed },
			});

			return { output: parsed as JsonValue, trace };
		}

		throw new Error("Agentic run exceeded maxIterations budget");
	}

	private static extractFinalJson(text: string): string {
		// Prefer an explicit marker if present
		const marker = /<final_json>\s*([\s\S]*?)\s*<\/final_json>/i.exec(text);
		if (marker && marker[1]) return marker[1].trim();

		// Otherwise, attempt to find the first JSON object/array
		const startObj = text.indexOf("{");
		const startArr = text.indexOf("[");
		const start = startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
		if (start === -1) return text.trim();
		return text.slice(start).trim();
	}
}
