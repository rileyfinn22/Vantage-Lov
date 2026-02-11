import type { ToolDefinition, JsonValue } from "#/agentic/types";
import {
	generateBattleCardFromObjection,
	generateBattleCardFromPainPoint,
	generateTrainingScenario,
	saveBattleCard,
	saveTrainingScenario,
} from "#/services/BattleCardGenerationService";
import type { AggregatedObjection, AggregatedPainPoint } from "#/services/InsightsAggregationService";
import type { BattleCardContent } from "#/services/BattleCardGenerationService";

export function getBattleCardTools(): ToolDefinition[] {
	const tools: ToolDefinition[] = [
		{
			name: "generate_battle_card_from_objection",
			description: "Generate a battle card from an aggregated objection object.",
			inputSchema: {
				type: "object",
				properties: {
					objection: {
						type: "object",
						description: "AggregatedObjection object with id, title, description, phase, frequency, successRate, impactScore, topExamples",
					},
					companyContext: { type: "string", description: "Optional company context for personalization" },
				},
				required: ["objection"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const objection = args.objection as AggregatedObjection;
				const companyContext = args.companyContext ? String(args.companyContext) : undefined;
				return (await generateBattleCardFromObjection(objection, companyContext)) as any;
			},
		},
		{
			name: "generate_battle_card_from_pain_point",
			description: "Generate a battle card from an aggregated pain point object.",
			inputSchema: {
				type: "object",
				properties: {
					painPoint: {
						type: "object",
						description: "AggregatedPainPoint object with id, title, description, phase, frequency, isProspectPain, resolutionRate, impactScore, topExamples",
					},
					companyContext: { type: "string", description: "Optional company context for personalization" },
				},
				required: ["painPoint"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const painPoint = args.painPoint as AggregatedPainPoint;
				const companyContext = args.companyContext ? String(args.companyContext) : undefined;
				return (await generateBattleCardFromPainPoint(painPoint, companyContext)) as any;
			},
		},
		{
			name: "generate_training_scenario",
			description: "Generate a training scenario from a battle card content object.",
			inputSchema: {
				type: "object",
				properties: {
					battleCard: {
						type: "object",
						description: "BattleCardContent object with title, challenge, phase, strategy, approach, script, nextStep",
					},
					sourceType: {
						type: "string",
						enum: ["objection", "pain_point"],
						description: "Source type of the battle card",
					},
				},
				required: ["battleCard", "sourceType"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const battleCard = args.battleCard as BattleCardContent;
				const sourceType = args.sourceType as "objection" | "pain_point";
				return (await generateTrainingScenario(battleCard, sourceType)) as any;
			},
		},
		{
			name: "save_battle_card",
			description: "Persist a generated battle card to the database.",
			inputSchema: {
				type: "object",
				properties: {
					companyId: { type: "number" },
					battleCard: { type: "object", description: "BattleCardContent object" },
					sourceType: { type: "string", enum: ["objection", "pain_point"] },
					sourceId: { type: "number", description: "ID of the source objection or pain point" },
					metrics: {
						type: "object",
						properties: {
							frequency: { type: "number" },
							successRate: { type: "number" },
							impactScore: { type: "number" },
						},
						required: ["frequency", "successRate", "impactScore"],
					},
				},
				required: ["companyId", "battleCard", "sourceType", "sourceId", "metrics"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const battleCardId = await saveBattleCard(
					Number(args.companyId),
					args.battleCard as BattleCardContent,
					args.sourceType as "objection" | "pain_point",
					Number(args.sourceId),
					args.metrics as { frequency: number; successRate: number; impactScore: number },
				);
				return { battleCardId } as any;
			},
		},
		{
			name: "save_training_scenario",
			description: "Persist a generated training scenario to the database.",
			inputSchema: {
				type: "object",
				properties: {
					battleCardId: { type: "number", description: "ID of the battle card to link to" },
					scenario: { type: "object", description: "TrainingScenarioContent object" },
					skillKey: { type: "string", description: "Skill key for the scenario (e.g., objection_handling)" },
				},
				required: ["battleCardId", "scenario", "skillKey"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const scenarioId = await saveTrainingScenario(
					Number(args.battleCardId),
					args.scenario,
					String(args.skillKey),
				);
				return { scenarioId } as any;
			},
		},
	];

	return tools;
}
