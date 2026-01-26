import { ANTHROPIC_MODEL } from "#/lib/anthropic";
import { SupervisorAgentRunner } from "#/agentic/SupervisorAgentRunner";
import { ToolRegistry } from "#/agentic/ToolRegistry";
import type { AgenticRunConfig, ToolContext, JsonValue } from "#/agentic/types";
import { getBattleCardsWeeklyTools } from "#/agentic/features/battleCardsWeeklyTools";
import { getBattleCardTools } from "#/agentic/features/battleCardTools";
import { getCalibrationTools } from "#/agentic/features/calibrationTools";

export type AgenticFeatureKey =
	| "battle_cards_weekly_generate"
	| "battle_card_generate_from_objection"
	| "battle_card_generate_from_pain_point"
	| "calibration_run";

function getToolsForFeature(feature: AgenticFeatureKey): ToolRegistry {
	switch (feature) {
		case "battle_cards_weekly_generate":
			return new ToolRegistry(getBattleCardsWeeklyTools());
		case "battle_card_generate_from_objection":
		case "battle_card_generate_from_pain_point":
			return new ToolRegistry(getBattleCardTools());
		case "calibration_run":
			return new ToolRegistry(getCalibrationTools());
		default: {
			const _exhaustive: never = feature;
			return _exhaustive;
		}
	}
}

function getSystemPrompt(feature: AgenticFeatureKey): string {
	return [
		"You are an agentic workflow orchestrator.",
		"You MUST use tools to perform actions; do not hallucinate data.",
		"Keep iterations low and prefer direct tool calls.",
		"Return final output as strict JSON wrapped in <final_json> tags.",
		`Feature: ${feature}`,
	].join("\n");
}

function getUserPrompt(feature: AgenticFeatureKey, input: Record<string, unknown>): string {
	return [
		"Goal: Execute the requested feature end-to-end using available tools.",
		"Constraints:",
		"- Only call allowlisted tools.",
		"- If required inputs are missing, return an error JSON.",
		"Input JSON:",
		JSON.stringify(input),
	].join("\n");
}

export class AgenticFeatureOrchestrationService {
	static async run(params: {
		feature: AgenticFeatureKey;
		input: Record<string, unknown>;
		ctx: ToolContext;
		config?: Partial<AgenticRunConfig>;
	}): Promise<{ output: JsonValue; trace: unknown[] }> {
		const { feature, input, ctx } = params;
		const toolRegistry = getToolsForFeature(feature);

		const config: AgenticRunConfig = {
			model: ANTHROPIC_MODEL,
			temperature: 0.2,
			budgets: {
				maxIterations: params.config?.budgets?.maxIterations ?? 8,
				maxToolCalls: params.config?.budgets?.maxToolCalls ?? 20,
				maxTimeMs: params.config?.budgets?.maxTimeMs ?? 60_000,
			},
		};

		const system = getSystemPrompt(feature);
		const userPrompt = getUserPrompt(feature, input);

		const { output, trace } = await SupervisorAgentRunner.run({
			config,
			toolRegistry,
			ctx,
			system,
			userPrompt,
		});

		return { output, trace };
	}
}
