import { ANTHROPIC_MODEL } from "#/lib/anthropic";
import { SupervisorAgentRunner } from "#/agentic/SupervisorAgentRunner";
import { ToolRegistry } from "#/agentic/ToolRegistry";
import type { AgenticRunConfig, ToolContext, JsonValue } from "#/agentic/types";
import { getBattleCardsWeeklyTools } from "#/agentic/features/battleCardsWeeklyTools";
import { getBattleCardTools } from "#/agentic/features/battleCardTools";
import { getCalibrationTools } from "#/agentic/features/calibrationTools";
import { getInteractionPipelineTools } from "#/agentic/features/interactionPipelineTools";

export type AgenticFeatureKey =
	| "battle_cards_weekly_generate"
	| "battle_card_generate_from_objection"
	| "battle_card_generate_from_pain_point"
	| "calibration_run"
	| "interaction_branched_pipeline";

function getToolsForFeature(feature: AgenticFeatureKey): ToolRegistry {
	switch (feature) {
		case "battle_cards_weekly_generate":
			return new ToolRegistry(getBattleCardsWeeklyTools());
		case "battle_card_generate_from_objection":
		case "battle_card_generate_from_pain_point":
			return new ToolRegistry(getBattleCardTools());
		case "calibration_run":
			return new ToolRegistry(getCalibrationTools());
		case "interaction_branched_pipeline":
			return new ToolRegistry(getInteractionPipelineTools());
		default: {
			const _exhaustive: never = feature;
			return _exhaustive;
		}
	}
}

function getFeaturePromptKey(feature: AgenticFeatureKey): string {
	switch (feature) {
		case "battle_cards_weekly_generate":
			return "FEATURE_BATTLE_CARDS_WEEKLY";
		case "battle_card_generate_from_objection":
		case "battle_card_generate_from_pain_point":
			return "FEATURE_BATTLE_CARD_GENERATE";
		case "calibration_run":
			return "FEATURE_COMPANY_CALIBRATE";
		case "interaction_branched_pipeline":
			return "FEATURE_INTERACTION_PIPELINE";
		default: {
			const _exhaustive: never = feature;
			return _exhaustive;
		}
	}
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

		const featureKey = getFeaturePromptKey(feature);
		const userPrompt = getUserPrompt(feature, input);

		const { output, trace } = await SupervisorAgentRunner.run({
			config,
			toolRegistry,
			ctx,
			featureKey,
			system: "",
			userPrompt,
		});

		return { output, trace };
	}
}
