import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentRunner } from "./AgentRunner";
import { SupervisorAgentRunner } from "./SupervisorAgentRunner";
import { ToolRegistry } from "./ToolRegistry";
import type { ToolDefinition, ToolContext, AgenticRunConfig, JsonValue } from "./types";

// Mock the Anthropic client
vi.mock("#/lib/anthropic", () => ({
	getAnthropicClient: () => mockAnthropicClient,
}));

// Mock logger to reduce noise
vi.mock("#/lib/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock Anthropic client
let mockAnthropicClient: {
	messages: {
		create: ReturnType<typeof vi.fn>;
	};
};

// Test fixtures
const defaultConfig: AgenticRunConfig = {
	model: "claude-3-5-sonnet-20241022",
	temperature: 0.2,
	budgets: {
		maxIterations: 5,
		maxToolCalls: 10,
		maxTimeMs: 30000,
	},
};

const defaultContext: ToolContext = {
	workflowStateId: 1,
	workflowType: "test",
	workflowId: "test-workflow-123",
	metadata: {},
};

// Helper to create mock tools
function createMockTools(): ToolDefinition[] {
	return [
		{
			name: "get_data",
			description: "Fetch data by ID",
			inputSchema: {
				type: "object",
				properties: { id: { type: "number" } },
				required: ["id"],
			},
			handler: async (args: unknown): Promise<JsonValue> => {
				const { id } = args as { id: number };
				return { id, name: `Item ${id}`, status: "active" };
			},
		},
		{
			name: "update_data",
			description: "Update data by ID",
			inputSchema: {
				type: "object",
				properties: {
					id: { type: "number" },
					updates: { type: "object" },
				},
				required: ["id", "updates"],
			},
			handler: async (args: unknown): Promise<JsonValue> => {
				const { id, updates } = args as { id: number; updates: Record<string, unknown> };
				return { id, ...updates, updated: true };
			},
		},
		{
			name: "list_items",
			description: "List all items",
			inputSchema: { type: "object", properties: {}, required: [] },
			handler: async (): Promise<JsonValue> => {
				return [
					{ id: 1, name: "Item 1" },
					{ id: 2, name: "Item 2" },
					{ id: 3, name: "Item 3" },
				];
			},
		},
	];
}

// Helper to create a mock Anthropic response
function createMockResponse(options: {
	content: Array<{ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown }>;
	stopReason?: string;
}) {
	return {
		content: options.content,
		stop_reason: options.stopReason ?? "end_turn",
		usage: { input_tokens: 100, output_tokens: 50 },
	};
}

describe("ToolRegistry", () => {
	test("registers tools and returns Anthropic format", () => {
		const tools = createMockTools();
		const registry = new ToolRegistry(tools);

		const anthropicTools = registry.getAnthropicTools();
		expect(anthropicTools).toHaveLength(3);
		expect(anthropicTools[0]).toEqual({
			name: "get_data",
			description: "Fetch data by ID",
			input_schema: tools[0].inputSchema,
		});
	});

	test("has() returns true for registered tools", () => {
		const registry = new ToolRegistry(createMockTools());
		expect(registry.has("get_data")).toBe(true);
		expect(registry.has("update_data")).toBe(true);
		expect(registry.has("nonexistent")).toBe(false);
	});

	test("getToolNames() returns all tool names", () => {
		const registry = new ToolRegistry(createMockTools());
		expect(registry.getToolNames()).toEqual(["get_data", "update_data", "list_items"]);
	});

	test("execute() runs tool handler and returns result with events", async () => {
		const registry = new ToolRegistry(createMockTools());

		const { result, events } = await registry.execute("get_data", { id: 42 }, defaultContext);

		expect(result).toEqual({ id: 42, name: "Item 42", status: "active" });
		expect(events).toHaveLength(2);
		expect(events[0].type).toBe("TOOL_CALL");
		expect(events[1].type).toBe("TOOL_RESULT");
	});

	test("execute() throws for unknown tool", async () => {
		const registry = new ToolRegistry(createMockTools());

		await expect(registry.execute("unknown_tool", {}, defaultContext)).rejects.toThrow("Tool not found: unknown_tool");
	});
});

describe("AgentRunner", () => {
	beforeEach(() => {
		mockAnthropicClient = {
			messages: {
				create: vi.fn(),
			},
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns final JSON output when model responds with text", async () => {
		const registry = new ToolRegistry(createMockTools());

		// Model returns final JSON directly
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '{"result": "success", "value": 42}' }],
			})
		);

		const { output, trace } = await AgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			system: "You are a helpful assistant.",
			userPrompt: "Return a success result.",
		});

		expect(output).toEqual({ result: "success", value: 42 });
		expect(trace.length).toBeGreaterThan(0);
		expect(trace.some((e) => e.type === "FINAL_OUTPUT")).toBe(true);
	});

	test("executes tool calls and continues until final output", async () => {
		const registry = new ToolRegistry(createMockTools());

		// First response: tool call
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{ type: "tool_use", id: "tool_1", name: "get_data", input: { id: 1 } },
				],
				stopReason: "tool_use",
			})
		);

		// Second response: final output after tool result
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '{"fetched": true, "item": {"id": 1, "name": "Item 1"}}' }],
			})
		);

		const { output, trace } = await AgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			system: "You are a helpful assistant.",
			userPrompt: "Get data for item 1.",
		});

		expect(output).toEqual({ fetched: true, item: { id: 1, name: "Item 1" } });
		expect(trace.some((e) => e.type === "TOOL_CALL")).toBe(true);
		expect(trace.some((e) => e.type === "TOOL_RESULT")).toBe(true);
	});

	test("handles multiple tool calls in sequence", async () => {
		const registry = new ToolRegistry(createMockTools());

		// First response: list items
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "tool_use", id: "tool_1", name: "list_items", input: {} }],
				stopReason: "tool_use",
			})
		);

		// Second response: get specific item
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "tool_use", id: "tool_2", name: "get_data", input: { id: 2 } }],
				stopReason: "tool_use",
			})
		);

		// Third response: final output
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '{"items": 3, "selectedItem": {"id": 2, "name": "Item 2"}}' }],
			})
		);

		const { output, trace } = await AgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			system: "You are a helpful assistant.",
			userPrompt: "List items and get details for item 2.",
		});

		expect(output).toEqual({ items: 3, selectedItem: { id: 2, name: "Item 2" } });
		expect(trace.filter((e) => e.type === "TOOL_CALL")).toHaveLength(2);
	});

	test("throws when maxToolCalls budget exceeded", async () => {
		const registry = new ToolRegistry(createMockTools());
		const limitedConfig = {
			...defaultConfig,
			budgets: { ...defaultConfig.budgets, maxToolCalls: 1 },
		};

		// Keep returning tool calls
		mockAnthropicClient.messages.create.mockResolvedValue(
			createMockResponse({
				content: [
					{ type: "tool_use", id: "tool_1", name: "list_items", input: {} },
					{ type: "tool_use", id: "tool_2", name: "get_data", input: { id: 1 } },
				],
				stopReason: "tool_use",
			})
		);

		await expect(
			AgentRunner.run({
				config: limitedConfig,
				toolRegistry: registry,
				ctx: defaultContext,
				system: "You are a helpful assistant.",
				userPrompt: "Do many things.",
			})
		).rejects.toThrow("exceeded maxToolCalls budget");
	});

	test("throws when maxIterations budget exceeded", async () => {
		const registry = new ToolRegistry(createMockTools());
		const limitedConfig = {
			...defaultConfig,
			budgets: { ...defaultConfig.budgets, maxIterations: 2 },
		};

		// Keep returning non-parseable responses
		mockAnthropicClient.messages.create.mockResolvedValue(
			createMockResponse({
				content: [{ type: "text", text: "I cannot provide JSON output." }],
			})
		);

		await expect(
			AgentRunner.run({
				config: limitedConfig,
				toolRegistry: registry,
				ctx: defaultContext,
				system: "You are a helpful assistant.",
				userPrompt: "Return JSON.",
			})
		).rejects.toThrow("exceeded maxIterations budget");
	});

	test("rejects unknown tool calls", async () => {
		const registry = new ToolRegistry(createMockTools());

		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "tool_use", id: "tool_1", name: "dangerous_tool", input: {} }],
				stopReason: "tool_use",
			})
		);

		await expect(
			AgentRunner.run({
				config: defaultConfig,
				toolRegistry: registry,
				ctx: defaultContext,
				system: "You are a helpful assistant.",
				userPrompt: "Do something.",
			})
		).rejects.toThrow("Tool not allowed: dangerous_tool");
	});

	test("extracts JSON from <final_json> tags", async () => {
		const registry = new ToolRegistry(createMockTools());

		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{
						type: "text",
						text: 'Here is the result:\n<final_json>{"status": "completed", "count": 5}</final_json>\nDone!',
					},
				],
			})
		);

		const { output } = await AgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			system: "You are a helpful assistant.",
			userPrompt: "Return status.",
		});

		expect(output).toEqual({ status: "completed", count: 5 });
	});
});

describe("SupervisorAgentRunner", () => {
	beforeEach(() => {
		mockAnthropicClient = {
			messages: {
				create: vi.fn(),
			},
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("orchestrates planner -> executor -> verifier flow", async () => {
		const registry = new ToolRegistry(createMockTools());

		// 1. Planner response
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{
						type: "text",
						text: `<plan_json>{"steps": [{"stepId": "1", "toolName": "get_data", "args": {"id": 1}, "purpose": "Fetch item", "stopCondition": "Item fetched"}]}</plan_json>`,
					},
				],
			})
		);

		// 2. Executor first call - tool use
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "tool_use", id: "exec_tool_1", name: "get_data", input: { id: 1 } }],
				stopReason: "tool_use",
			})
		);

		// 3. Executor second call - final output
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '{"item": {"id": 1, "name": "Item 1", "status": "active"}}' }],
			})
		);

		// 4. Verifier response - pass
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{
						type: "text",
						text: '<verify_json>{"pass": true, "issues": [], "requiredFixes": []}</verify_json>',
					},
				],
			})
		);

		const { output, trace } = await SupervisorAgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			userPrompt: "Get item 1 data.",
			outputShapeHint: "Return item object with id, name, status.",
		});

		expect(output).toEqual({ item: { id: 1, name: "Item 1", status: "active" } });

		// Verify trace includes planner and verifier sub-agents
		const subAgentEvents = trace.filter((e) => e.type === "SUB_AGENT");
		expect(subAgentEvents.length).toBeGreaterThanOrEqual(2);

		const plannerEvent = subAgentEvents.find((e) => (e.data as any).agent === "PLANNER");
		const verifierEvent = subAgentEvents.find((e) => (e.data as any).agent === "VERIFIER");
		expect(plannerEvent).toBeDefined();
		expect(verifierEvent).toBeDefined();
	});

	test("triggers repair pass when verifier fails", async () => {
		const registry = new ToolRegistry(createMockTools());

		// 1. Planner
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{
						type: "text",
						text: `<plan_json>{"steps": [{"stepId": "1", "toolName": null, "args": {}, "purpose": "Return data", "stopCondition": "Done"}]}</plan_json>`,
					},
				],
			})
		);

		// 2. Executor - returns incomplete output
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '{"partial": true}' }],
			})
		);

		// 3. Verifier - fails with required fixes
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{
						type: "text",
						text: '<verify_json>{"pass": false, "issues": ["Missing required fields"], "requiredFixes": ["Add status field"]}</verify_json>',
					},
				],
			})
		);

		// 4. Repair agent - returns fixed output
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '{"partial": true, "status": "completed"}' }],
			})
		);

		const { output, trace } = await SupervisorAgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			userPrompt: "Return complete data.",
			outputShapeHint: "Return object with status field.",
		});

		expect(output).toEqual({ partial: true, status: "completed" });

		// Verify repair was triggered (more model calls than normal flow)
		expect(mockAnthropicClient.messages.create).toHaveBeenCalledTimes(4);
	});

	test("supports legacy params format", async () => {
		const registry = new ToolRegistry(createMockTools());

		// Planner
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '<plan_json>{"steps": []}</plan_json>' }],
			})
		);

		// Executor
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '{"legacy": true}' }],
			})
		);

		// Verifier
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '<verify_json>{"pass": true, "issues": [], "requiredFixes": []}</verify_json>' }],
			})
		);

		const { output } = await SupervisorAgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			systemBase: "Legacy system prompt.",
			goal: "Legacy goal.",
			outputShapeHint: "Return JSON.",
		} as any);

		expect(output).toEqual({ legacy: true });
	});

	test("handles planner returning invalid JSON gracefully", async () => {
		const registry = new ToolRegistry(createMockTools());

		// Planner returns garbage
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: "I cannot create a plan right now." }],
			})
		);

		// Executor with fallback plan
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '{"fallback": true}' }],
			})
		);

		// Verifier
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '<verify_json>{"pass": true, "issues": [], "requiredFixes": []}</verify_json>' }],
			})
		);

		const { output } = await SupervisorAgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			userPrompt: "Do something.",
		});

		// Should still produce output with fallback plan
		expect(output).toEqual({ fallback: true });
	});
});

describe("Integration: Feature Prompts", () => {
	beforeEach(() => {
		mockAnthropicClient = {
			messages: {
				create: vi.fn(),
			},
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("flag session workflow produces expected output shape", async () => {
		// Simulate flag session tools (simplified)
		const flagSessionTools: ToolDefinition[] = [
			{
				name: "get_flag_details",
				description: "Fetch flag details",
				inputSchema: { type: "object", properties: { flagId: { type: "number" } }, required: ["flagId"] },
				handler: async (args: unknown): Promise<JsonValue> => {
					return {
						flag: { id: 1, reason: "Poor objection handling" },
						interaction: { id: 10, transcript: "Sample transcript" },
						salesperson: { id: 5, name: "John" },
					};
				},
			},
			{
				name: "generate_roleplay_prompt_from_flag",
				description: "Generate roleplay prompt",
				inputSchema: { type: "object", properties: { flagId: { type: "number" } }, required: ["flagId"] },
				handler: async (): Promise<JsonValue> => {
					return {
						systemPrompt: "You are a difficult customer...",
						firstMessage: "I need to speak to your manager.",
						metadata: { difficulty: "hard" },
					};
				},
			},
			{
				name: "create_training_agent",
				description: "Create ElevenLabs agent",
				inputSchema: {
					type: "object",
					properties: { prompt: { type: "string" }, firstMessage: { type: "string" } },
					required: ["prompt", "firstMessage"],
				},
				handler: async (): Promise<JsonValue> => {
					return { agentId: "agent_abc123" };
				},
			},
			{
				name: "get_signed_url",
				description: "Get signed URL",
				inputSchema: { type: "object", properties: { agentId: { type: "string" } }, required: ["agentId"] },
				handler: async (): Promise<JsonValue> => {
					return { signedUrl: "https://elevenlabs.io/signed/abc123" };
				},
			},
		];

		const registry = new ToolRegistry(flagSessionTools);

		// Planner
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{
						type: "text",
						text: `<plan_json>{
							"steps": [
								{"stepId": "1", "toolName": "get_flag_details", "args": {"flagId": 1}, "purpose": "Load flag", "stopCondition": "Flag loaded"},
								{"stepId": "2", "toolName": "generate_roleplay_prompt_from_flag", "args": {"flagId": 1}, "purpose": "Generate prompt", "stopCondition": "Prompt generated"},
								{"stepId": "3", "toolName": "create_training_agent", "args": {}, "purpose": "Create agent", "stopCondition": "Agent created"},
								{"stepId": "4", "toolName": "get_signed_url", "args": {}, "purpose": "Get URL", "stopCondition": "URL obtained"}
							]
						}</plan_json>`,
					},
				],
			})
		);

		// Executor - tool calls in sequence
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "tool_use", id: "t1", name: "get_flag_details", input: { flagId: 1 } }],
				stopReason: "tool_use",
			})
		);

		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "tool_use", id: "t2", name: "generate_roleplay_prompt_from_flag", input: { flagId: 1 } }],
				stopReason: "tool_use",
			})
		);

		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{
						type: "tool_use",
						id: "t3",
						name: "create_training_agent",
						input: { prompt: "You are a difficult customer...", firstMessage: "I need to speak to your manager." },
					},
				],
				stopReason: "tool_use",
			})
		);

		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "tool_use", id: "t4", name: "get_signed_url", input: { agentId: "agent_abc123" } }],
				stopReason: "tool_use",
			})
		);

		// Final output
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							agentId: "agent_abc123",
							sessionId: "session_xyz",
							signedUrl: "https://elevenlabs.io/signed/abc123",
							flag: { id: 1, reason: "Poor objection handling" },
						}),
					},
				],
			})
		);

		// Verifier
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '<verify_json>{"pass": true, "issues": [], "requiredFixes": []}</verify_json>' }],
			})
		);

		const { output } = await SupervisorAgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			featureKey: "FEATURE_FLAG_SESSION",
			userPrompt: "Start a training flag session for flagId=1, salespersonId=5, allowReuse=false.",
			outputShapeHint: "Return { agentId, sessionId, signedUrl, flag, battleCard? }",
		});

		// Verify output shape matches flag session requirements
		expect(output).toHaveProperty("agentId");
		expect(output).toHaveProperty("signedUrl");
		expect(output).toHaveProperty("flag");
		expect((output as any).agentId).toBe("agent_abc123");
	});

	test("interaction pipeline produces analysis results", async () => {
		const pipelineTools: ToolDefinition[] = [
			{
				name: "load_interaction_context",
				description: "Load interaction transcript",
				inputSchema: { type: "object", properties: { interactionId: { type: "number" } }, required: ["interactionId"] },
				handler: async (): Promise<JsonValue> => ({
					transcript: "Rep: Hello! Prospect: Hi, I'm interested...",
					salespersonId: 5,
					companyId: 1,
					companyContext: "Tech startup, B2B SaaS",
				}),
			},
			{
				name: "load_analysis_prompts",
				description: "Load prompts",
				inputSchema: { type: "object", properties: {} },
				handler: async (): Promise<JsonValue> => ({
					ratingPromptText: "Rate the call...",
					flaggingPromptText: "Identify issues...",
					extractionPromptText: "Extract insights...",
					personaPromptText: "Generate persona...",
				}),
			},
			{
				name: "run_branched_analysis",
				description: "Run LLM analysis",
				inputSchema: { type: "object", properties: {} },
				handler: async (): Promise<JsonValue> => ({
					rating: { overall: 7.5, categories: { discovery: 8, closing: 6 } },
					flags: [{ type: "weak_closing", severity: "medium" }],
					extraction: { objections: ["price"], competitors: ["Acme"] },
					persona: { buyerType: "analytical", painPoints: ["cost"] },
				}),
			},
			{
				name: "persist_rating",
				description: "Save rating",
				inputSchema: { type: "object", properties: {} },
				handler: async (): Promise<JsonValue> => ({ saved: true }),
			},
			{
				name: "persist_flags",
				description: "Save flags",
				inputSchema: { type: "object", properties: {} },
				handler: async (): Promise<JsonValue> => ({ flagIds: [101] }),
			},
		];

		const registry = new ToolRegistry(pipelineTools);

		// Planner
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '<plan_json>{"steps": []}</plan_json>' }],
			})
		);

		// Executor - simplified flow
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "tool_use", id: "t1", name: "load_interaction_context", input: { interactionId: 10 } }],
				stopReason: "tool_use",
			})
		);

		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "tool_use", id: "t2", name: "run_branched_analysis", input: {} }],
				stopReason: "tool_use",
			})
		);

		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							interactionId: 10,
							rating: 7.5,
							flagsCreated: 1,
							analysisComplete: true,
						}),
					},
				],
			})
		);

		// Verifier
		mockAnthropicClient.messages.create.mockResolvedValueOnce(
			createMockResponse({
				content: [{ type: "text", text: '<verify_json>{"pass": true, "issues": [], "requiredFixes": []}</verify_json>' }],
			})
		);

		const { output } = await SupervisorAgentRunner.run({
			config: defaultConfig,
			toolRegistry: registry,
			ctx: defaultContext,
			featureKey: "FEATURE_INTERACTION_PIPELINE",
			userPrompt: "Analyze interaction 10.",
		});

		expect(output).toHaveProperty("interactionId", 10);
		expect(output).toHaveProperty("analysisComplete", true);
	});
});
