import type { ToolDefinition, JsonValue } from "#/agentic/types";
import {
	generateBattleCardFromObjection,
	generateBattleCardFromPainPoint,
	generateTrainingScenario,
	saveBattleCard,
	saveTrainingScenario,
} from "#/services/BattleCardGenerationService";

export function getBattleCardTools(): ToolDefinition[] {
	const tools: ToolDefinition[] = [
		{
			name: "generate_battle_card_from_objection",
			description: "Generate a battle card from an objection string for a given company.",
			inputSchema: {
				type: "object",
				properties: {
					companyId: { type: "number" },
					objection: { type: "string" },
				},
				required: ["companyId", "objection"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				return (await generateBattleCardFromObjection(Number(args.companyId), String(args.objection))) as any;
			},
		},
		{
			name: "generate_battle_card_from_pain_point",
			description: "Generate a battle card from a pain point string for a given company.",
			inputSchema: {
				type: "object",
				properties: {
					companyId: { type: "number" },
					painPoint: { type: "string" },
					persona: { type: "string", description: "optional persona context" },
				},
				required: ["companyId", "painPoint"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				return (await generateBattleCardFromPainPoint(
					Number(args.companyId),
					String(args.painPoint),
					args.persona ? String(args.persona) : undefined,
				)) as any;
			},
		},
		{
			name: "generate_training_scenario",
			description: "Generate a training scenario from a battle card payload.",
			inputSchema: {
				type: "object",
				properties: {
					companyId: { type: "number" },
					battleCardId: { type: "number" },
					title: { type: "string" },
					challenge: { type: "string" },
				},
				required: ["companyId", "title", "challenge"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				return (await generateTrainingScenario(Number(args.companyId), {
					battleCardId: args.battleCardId ? Number(args.battleCardId) : undefined,
					title: String(args.title),
					challenge: String(args.challenge),
				})) as any;
			},
		},
		{
			name: "save_battle_card",
			description: "Persist a generated battle card to the database.",
			inputSchema: {
				type: "object",
				properties: {
					companyId: { type: "number" },
					battleCard: { type: "object" },
				},
				required: ["companyId", "battleCard"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				return (await saveBattleCard(Number(args.companyId), args.battleCard)) as any;
			},
		},
		{
			name: "save_training_scenario",
			description: "Persist a generated training scenario to the database.",
			inputSchema: {
				type: "object",
				properties: {
					companyId: { type: "number" },
					scenario: { type: "object" },
				},
				required: ["companyId", "scenario"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				return (await saveTrainingScenario(Number(args.companyId), args.scenario)) as any;
			},
		},
	];

	return tools;
}
