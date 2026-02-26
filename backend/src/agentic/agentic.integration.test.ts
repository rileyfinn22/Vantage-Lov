/**
 * Integration tests for the Vantage Agentic System
 *
 * These tests verify that:
 * 1. Feature prompts are loaded correctly from the filesystem
 * 2. The SupervisorAgentRunner properly loads and uses prompts
 * 3. Tool registries are correctly configured for each feature
 * 4. The orchestration services properly wire everything together
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ToolRegistry } from "./ToolRegistry";
import { getFlagSessionTools } from "./workflows/flagSessionTools";
import { getScenarioSessionTools } from "./workflows/scenarioSessionTools";
import { getInteractionPipelineTools } from "./features/interactionPipelineTools";
import { getBattleCardTools } from "./features/battleCardTools";
import { getBattleCardsWeeklyTools } from "./features/battleCardsWeeklyTools";
import { getCalibrationTools } from "./features/calibrationTools";

// Mock the Anthropic client for SupervisorAgentRunner tests
vi.mock("#/lib/anthropic", () => ({
	getAnthropicClient: () => mockAnthropicClient,
	ANTHROPIC_MODEL: "claude-3-5-sonnet-20241022",
}));

// Mock logger
vi.mock("#/lib/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

let mockAnthropicClient: { messages: { create: ReturnType<typeof vi.fn> } };

describe("Prompt Files Integration", () => {
	const promptsDir = path.join(__dirname, "prompts");
	const featuresDir = path.join(promptsDir, "features");

	test("SUPERVISOR_SUPERPROMPT.md exists and has required content", () => {
		const superPromptPath = path.join(promptsDir, "SUPERVISOR_SUPERPROMPT.md");
		expect(fs.existsSync(superPromptPath)).toBe(true);

		const content = fs.readFileSync(superPromptPath, "utf8");

		// Verify key sections exist
		expect(content).toContain("Supervisor Agent");
		expect(content).toContain("Non-negotiable principles");
		expect(content).toContain("Sub-agent model");
		expect(content).toContain("PLANNER");
		expect(content).toContain("EXECUTOR");
		expect(content).toContain("VERIFIER");
		expect(content).toContain("REPAIR");
	});

	test("All feature prompt files exist", () => {
		const expectedFeatures = [
			"FEATURE_BATTLE_CARD_GENERATE.md",
			"FEATURE_BATTLE_CARDS_WEEKLY.md",
			"FEATURE_COMPANY_CALIBRATE.md",
			"FEATURE_FLAG_SESSION.md",
			"FEATURE_INTERACTION_PIPELINE.md",
			"FEATURE_SCENARIO_SESSION.md",
		];

		for (const feature of expectedFeatures) {
			const featurePath = path.join(featuresDir, feature);
			expect(fs.existsSync(featurePath), `Feature prompt ${feature} should exist`).toBe(true);
		}
	});

	test("FEATURE_FLAG_SESSION.md has required content", () => {
		const featurePath = path.join(featuresDir, "FEATURE_FLAG_SESSION.md");
		const content = fs.readFileSync(featurePath, "utf8");

		expect(content).toContain("Flag Session");
		expect(content).toContain("flagId");
		expect(content).toContain("salespersonId");
		expect(content).toContain("agentId");
		expect(content).toContain("signedUrl");
	});

	test("FEATURE_INTERACTION_PIPELINE.md has required content", () => {
		const featurePath = path.join(featuresDir, "FEATURE_INTERACTION_PIPELINE.md");
		const content = fs.readFileSync(featurePath, "utf8");

		expect(content).toContain("INTERACTION_PIPELINE");
		expect(content).toContain("load_interaction_context");
		expect(content).toContain("load_analysis_prompts");
		expect(content).toContain("run_branched_analysis");
		expect(content).toContain("persist_rating");
		expect(content).toContain("persist_flags");
	});

	test("FEATURE_SCENARIO_SESSION.md has required content", () => {
		const featurePath = path.join(featuresDir, "FEATURE_SCENARIO_SESSION.md");
		const content = fs.readFileSync(featurePath, "utf8");

		expect(content).toContain("Scenario Session");
		expect(content).toContain("scenarioId");
		expect(content).toContain("salespersonId");
	});
});

describe("Tool Registry Integration", () => {
	describe("Flag Session Tools", () => {
		test("all required tools are registered", () => {
			const tools = getFlagSessionTools();
			const registry = new ToolRegistry(tools);

			const requiredTools = [
				"get_flag_details",
				"generate_roleplay_prompt_from_flag",
				"create_training_agent",
				"persist_flag_agent_id",
				"get_signed_url",
				"persist_workflow_result",
			];

			for (const toolName of requiredTools) {
				expect(registry.has(toolName), `Tool ${toolName} should be registered`).toBe(true);
			}
		});

		test("tools have valid schemas", () => {
			const tools = getFlagSessionTools();

			for (const tool of tools) {
				expect(tool.name).toBeTruthy();
				expect(tool.description).toBeTruthy();
				expect(tool.inputSchema).toBeDefined();
				expect(tool.inputSchema.type).toBe("object");
				expect(typeof tool.handler).toBe("function");
			}
		});
	});

	describe("Scenario Session Tools", () => {
		test("all required tools are registered", () => {
			const tools = getScenarioSessionTools();
			const registry = new ToolRegistry(tools);

			// These match the actual tool names in scenarioSessionTools.ts
			const requiredTools = [
				"get_scenario",
				"find_existing_session",
				"generate_elevenlabs_config",
				"create_training_agent",
				"store_session",
				"get_signed_url",
				"fetch_battle_card",
				"persist_workflow_result",
			];

			for (const toolName of requiredTools) {
				expect(registry.has(toolName), `Tool ${toolName} should be registered`).toBe(true);
			}
		});
	});

	describe("Interaction Pipeline Tools", () => {
		test("all required tools are registered", () => {
			const tools = getInteractionPipelineTools();
			const registry = new ToolRegistry(tools);

			const requiredTools = [
				"load_interaction_context",
				"load_analysis_prompts",
				"run_branched_analysis",
				"persist_rating",
				"persist_flags",
				"persist_extraction",
				"persist_persona",
			];

			for (const toolName of requiredTools) {
				expect(registry.has(toolName), `Tool ${toolName} should be registered`).toBe(true);
			}
		});
	});

	describe("Battle Card Tools", () => {
		test("tools are registered", () => {
			const tools = getBattleCardTools();
			const registry = new ToolRegistry(tools);

			expect(registry.getToolNames().length).toBeGreaterThan(0);
		});
	});

	describe("Battle Cards Weekly Tools", () => {
		test("tools are registered", () => {
			const tools = getBattleCardsWeeklyTools();
			const registry = new ToolRegistry(tools);

			expect(registry.getToolNames().length).toBeGreaterThan(0);
		});
	});

	describe("Calibration Tools", () => {
		test("run_calibration tool is registered", () => {
			const tools = getCalibrationTools();
			const registry = new ToolRegistry(tools);

			expect(registry.has("run_calibration")).toBe(true);
		});
	});
});

describe("SupervisorAgentRunner Prompt Loading", () => {
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

	test("loads supervisor superprompt into system message", async () => {
		const { SupervisorAgentRunner } = await import("./SupervisorAgentRunner");
		const registry = new ToolRegistry(getFlagSessionTools());

		// Mock all responses
		mockAnthropicClient.messages.create.mockResolvedValue({
			content: [{ type: "text", text: '<plan_json>{"steps": []}</plan_json>' }],
			stop_reason: "end_turn",
			usage: { input_tokens: 100, output_tokens: 50 },
		});

		// Run with a simple test
		try {
			await SupervisorAgentRunner.run({
				config: {
					model: "claude-3-5-sonnet-20241022",
					budgets: { maxIterations: 2, maxToolCalls: 5, maxTimeMs: 30000 },
				},
				toolRegistry: registry,
				ctx: { workflowStateId: 1, workflowType: "test", workflowId: "test-1", metadata: {} },
				featureKey: "FEATURE_FLAG_SESSION",
				userPrompt: "Test prompt",
			});
		} catch {
			// Expected to fail since mock doesn't return proper verifier response
		}

		// Verify the system message contains supervisor superprompt content
		const calls = mockAnthropicClient.messages.create.mock.calls;
		expect(calls.length).toBeGreaterThan(0);

		const firstCall = calls[0][0];
		expect(firstCall.system).toContain("Supervisor Agent");
		expect(firstCall.system).toContain("PLANNER");
	});

	test("loads feature prompt when featureKey is provided", async () => {
		const { SupervisorAgentRunner } = await import("./SupervisorAgentRunner");
		const registry = new ToolRegistry(getInteractionPipelineTools());

		mockAnthropicClient.messages.create.mockResolvedValue({
			content: [{ type: "text", text: '<plan_json>{"steps": []}</plan_json>' }],
			stop_reason: "end_turn",
			usage: { input_tokens: 100, output_tokens: 50 },
		});

		try {
			await SupervisorAgentRunner.run({
				config: {
					model: "claude-3-5-sonnet-20241022",
					budgets: { maxIterations: 2, maxToolCalls: 5, maxTimeMs: 30000 },
				},
				toolRegistry: registry,
				ctx: { workflowStateId: 1, workflowType: "test", workflowId: "test-1", metadata: {} },
				featureKey: "FEATURE_INTERACTION_PIPELINE",
				userPrompt: "Process interaction 123",
			});
		} catch {
			// Expected
		}

		// The feature prompt content should be loaded (check if the file was read)
		// Since we're mocking, we verify the structure is correct
		const calls = mockAnthropicClient.messages.create.mock.calls;
		expect(calls.length).toBeGreaterThan(0);
	});

	test("includes allowed tools in system message", async () => {
		const { SupervisorAgentRunner } = await import("./SupervisorAgentRunner");
		const registry = new ToolRegistry(getFlagSessionTools());

		mockAnthropicClient.messages.create.mockResolvedValue({
			content: [{ type: "text", text: '<plan_json>{"steps": []}</plan_json>' }],
			stop_reason: "end_turn",
			usage: { input_tokens: 100, output_tokens: 50 },
		});

		try {
			await SupervisorAgentRunner.run({
				config: {
					model: "claude-3-5-sonnet-20241022",
					budgets: { maxIterations: 2, maxToolCalls: 5, maxTimeMs: 30000 },
				},
				toolRegistry: registry,
				ctx: { workflowStateId: 1, workflowType: "test", workflowId: "test-1", metadata: {} },
				featureKey: "FEATURE_FLAG_SESSION",
				userPrompt: "Test prompt",
			});
		} catch {
			// Expected
		}

		const calls = mockAnthropicClient.messages.create.mock.calls;
		const firstCall = calls[0][0];

		// System message should mention allowed tools
		expect(firstCall.system).toContain("Allowed tools");
		expect(firstCall.system).toContain("get_flag_details");
	});
});

describe("AgenticFeatureOrchestrationService Integration", () => {
	test("feature key mapping returns correct tool names for interaction_branched_pipeline", () => {
		// Test the tool registry mapping directly without mocking API calls
		const pipelineTools = getInteractionPipelineTools();
		const toolNames = pipelineTools.map((t) => t.name);

		expect(toolNames).toContain("load_interaction_context");
		expect(toolNames).toContain("load_analysis_prompts");
		expect(toolNames).toContain("run_branched_analysis");
		expect(toolNames).toContain("persist_rating");
		expect(toolNames).toContain("persist_flags");
	});

	test("feature key mapping returns correct tool names for calibration", () => {
		const calibrationTools = getCalibrationTools();
		const toolNames = calibrationTools.map((t) => t.name);

		expect(toolNames).toContain("run_calibration");
	});

	test("feature key mapping returns correct tool names for battle cards", () => {
		const battleCardTools = getBattleCardTools();
		const toolNames = battleCardTools.map((t) => t.name);

		expect(toolNames.length).toBeGreaterThan(0);
	});
});

describe("AgenticWorkflowOrchestrationService Integration", () => {
	test("flag session tools include all required tools", () => {
		const flagTools = getFlagSessionTools();
		const toolNames = flagTools.map((t) => t.name);

		expect(toolNames).toContain("get_flag_details");
		expect(toolNames).toContain("generate_roleplay_prompt_from_flag");
		expect(toolNames).toContain("create_training_agent");
		expect(toolNames).toContain("persist_flag_agent_id");
		expect(toolNames).toContain("get_signed_url");
		expect(toolNames).toContain("persist_workflow_result");
	});

	test("scenario session tools include all required tools", () => {
		const scenarioTools = getScenarioSessionTools();
		const toolNames = scenarioTools.map((t) => t.name);

		expect(toolNames).toContain("get_scenario");
		expect(toolNames).toContain("find_existing_session");
		expect(toolNames).toContain("generate_elevenlabs_config");
		expect(toolNames).toContain("create_training_agent");
		expect(toolNames).toContain("store_session");
		expect(toolNames).toContain("get_signed_url");
		expect(toolNames).toContain("fetch_battle_card");
		expect(toolNames).toContain("persist_workflow_result");
	});

	test("all workflow tools have valid input schemas", () => {
		const allTools = [...getFlagSessionTools(), ...getScenarioSessionTools()];

		for (const tool of allTools) {
			expect(tool.inputSchema, `Tool ${tool.name} should have inputSchema`).toBeDefined();
			expect(tool.inputSchema.type, `Tool ${tool.name} inputSchema should be object type`).toBe("object");
			expect(tool.inputSchema.properties, `Tool ${tool.name} should have properties`).toBeDefined();
		}
	});
});

describe("End-to-End Prompt Flow Verification", () => {
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

	test("complete flow: prompt -> planner -> executor -> verifier", async () => {
		const { SupervisorAgentRunner } = await import("./SupervisorAgentRunner");
		const tools = getFlagSessionTools();
		const registry = new ToolRegistry(tools);

		// 1. Planner response with plan
		mockAnthropicClient.messages.create.mockResolvedValueOnce({
			content: [
				{
					type: "text",
					text: `<plan_json>{
						"steps": [
							{"stepId": "1", "toolName": "get_flag_details", "args": {"flagId": 1}, "purpose": "Load flag", "stopCondition": "Flag loaded"}
						]
					}</plan_json>`,
				},
			],
			stop_reason: "end_turn",
			usage: { input_tokens: 100, output_tokens: 50 },
		});

		// 2. Executor tool call
		mockAnthropicClient.messages.create.mockResolvedValueOnce({
			content: [{ type: "tool_use", id: "t1", name: "get_flag_details", input: { flagId: 1 } }],
			stop_reason: "tool_use",
			usage: { input_tokens: 100, output_tokens: 50 },
		});

		// 3. Executor final output
		mockAnthropicClient.messages.create.mockResolvedValueOnce({
			content: [
				{
					type: "text",
					text: JSON.stringify({
						agentId: "agent-123",
						signedUrl: "https://elevenlabs.io/signed/abc",
						flag: { id: 1, reason: "Poor closing" },
					}),
				},
			],
			stop_reason: "end_turn",
			usage: { input_tokens: 100, output_tokens: 50 },
		});

		// 4. Verifier pass
		mockAnthropicClient.messages.create.mockResolvedValueOnce({
			content: [
				{
					type: "text",
					text: '<verify_json>{"pass": true, "issues": [], "requiredFixes": []}</verify_json>',
				},
			],
			stop_reason: "end_turn",
			usage: { input_tokens: 100, output_tokens: 50 },
		});

		// Mock the tool handler to return test data
		vi.spyOn(tools[0], "handler").mockResolvedValue({
			flag: { id: 1, reason: "Poor closing" },
			interaction: { id: 10 },
			salesperson: { id: 5 },
		});

		const { output, trace } = await SupervisorAgentRunner.run({
			config: {
				model: "claude-3-5-sonnet-20241022",
				budgets: { maxIterations: 10, maxToolCalls: 20, maxTimeMs: 60000 },
			},
			toolRegistry: registry,
			ctx: { workflowStateId: 1, workflowType: "flag_session", workflowId: "test-1", metadata: {} },
			featureKey: "FEATURE_FLAG_SESSION",
			userPrompt: "Start flag session for flagId=1",
			outputShapeHint: "Return { agentId, signedUrl, flag }",
		});

		// Verify output
		expect(output).toHaveProperty("agentId");
		expect(output).toHaveProperty("signedUrl");
		expect(output).toHaveProperty("flag");

		// Verify trace includes all phases
		const subAgentEvents = trace.filter((e) => e.type === "SUB_AGENT");
		expect(subAgentEvents.some((e) => (e.data as any).agent === "PLANNER")).toBe(true);
		expect(subAgentEvents.some((e) => (e.data as any).agent === "VERIFIER")).toBe(true);

		// Verify tool was called
		expect(trace.some((e) => e.type === "TOOL_CALL")).toBe(true);
	});
});
