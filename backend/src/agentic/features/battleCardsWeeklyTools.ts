import type { ToolDefinition, JsonValue } from "#/agentic/types";
import { generateWeeklyInsightsWithBattleCards } from "#/services/InsightsAggregationService";

export function getBattleCardsWeeklyTools(): ToolDefinition[] {
	const tools: ToolDefinition[] = [
		{
			name: "generate_weekly_insights_with_battle_cards",
			description:
				"Generate weekly insights for a company and optionally auto-generate battle cards and scenarios for top items.",
			inputSchema: {
				type: "object",
				properties: {
					companyId: { type: "number" },
					weekDateIso: { type: "string", description: "ISO date string for any date in the target week" },
					generateBattleCards: { type: "boolean", default: true },
				},
				required: ["companyId"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const companyId = Number(args?.companyId);
				if (!companyId || Number.isNaN(companyId)) throw new Error("companyId is required");
				const weekDate = args?.weekDateIso ? new Date(String(args.weekDateIso)) : new Date();
				const generateBattleCards = args?.generateBattleCards !== false;
				return (await generateWeeklyInsightsWithBattleCards(companyId, weekDate, generateBattleCards)) as any;
			},
		},
	];

	return tools;
}
