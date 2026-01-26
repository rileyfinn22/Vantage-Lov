import { db } from "#/data";
import { trainingScenarios, trainingSessionsCompleted, battleCards, workflowState } from "#/data/schema";
import { and, eq } from "drizzle-orm";
import elevenlabsConversational from "#/vantage/elevenlabsConversational";
import { PersonaGenerationService } from "#/services/PersonaGenerationService";
import type { ToolDefinition, ToolContext, JsonValue } from "../types";

export function getScenarioSessionTools(): ToolDefinition[] {
	const tools: ToolDefinition[] = [
		{
			name: "get_scenario",
			description: "Fetch the training scenario by numeric id or scenarioId string.",
			inputSchema: {
				type: "object",
				properties: { scenarioId: { type: "string", description: "Numeric id or scenarioId string" } },
				required: ["scenarioId"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const scenarioId = String(args?.scenarioId ?? "");
				const isNumericId = /^\d+$/.test(scenarioId);
				const scenarios = isNumericId
					? await db.select().from(trainingScenarios).where(eq(trainingScenarios.id, parseInt(scenarioId, 10))).limit(1)
					: await db.select().from(trainingScenarios).where(eq(trainingScenarios.scenarioId, scenarioId)).limit(1);

				if (scenarios.length === 0) throw new Error("Scenario not found");
				return scenarios[0] as any;
			},
		},
		{
			name: "find_existing_session",
			description: "Find an existing in-progress training session for the scenario and salesperson.",
			inputSchema: {
				type: "object",
				properties: {
					scenarioDbId: { type: "number" },
					salespersonId: { type: "number" },
				},
				required: ["scenarioDbId", "salespersonId"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const session = await db.query.trainingSessionsCompleted.findFirst({
					where: and(
						eq(trainingSessionsCompleted.scenarioId, Number(args.scenarioDbId)),
						eq(trainingSessionsCompleted.salespersonId, Number(args.salespersonId)),
						eq(trainingSessionsCompleted.status, "in_progress"),
					),
				});
				return session ?? null;
			},
		},
		{
			name: "generate_elevenlabs_config",
			description: "Generate ElevenLabs system prompt and first message for a scenario and salesperson.",
			inputSchema: {
				type: "object",
				properties: { scenarioDbId: { type: "number" }, salespersonId: { type: "number" } },
				required: ["scenarioDbId", "salespersonId"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const cfg = await PersonaGenerationService.generateElevenLabsConfig(Number(args.scenarioDbId), Number(args.salespersonId));
				return cfg as any;
			},
		},
		{
			name: "create_training_agent",
			description: "Create an ElevenLabs conversational training agent from system prompt and first message.",
			inputSchema: {
				type: "object",
				properties: { prompt: { type: "string" }, firstMessage: { type: "string" } },
				required: ["prompt", "firstMessage"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const res = await elevenlabsConversational.createTrainingAgent(String(args.prompt), String(args.firstMessage));
				return { agentId: res.agentId } as any;
			},
		},
		{
			name: "store_session",
			description: "Create or update the training session record with agent prompt.",
			inputSchema: {
				type: "object",
				properties: {
					existingSessionId: { type: ["number", "null"] },
					scenarioDbId: { type: "number" },
					salespersonId: { type: "number" },
					agentId: { type: "string" },
					prompt: { type: "string" },
					firstMessage: { type: "string" },
				},
				required: ["existingSessionId", "scenarioDbId", "salespersonId", "agentId", "prompt", "firstMessage"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				const existingSessionId = args.existingSessionId === null ? null : Number(args.existingSessionId);
				if (!existingSessionId) {
					const [newSession] = await db
						.insert(trainingSessionsCompleted)
						.values({
							scenarioId: Number(args.scenarioDbId),
							salespersonId: Number(args.salespersonId),
							agentId: String(args.agentId),
							agentPrompt: { systemPrompt: String(args.prompt), firstMessage: String(args.firstMessage) },
							status: "in_progress",
						})
						.returning();
					return { sessionId: newSession.id } as any;
				}

				await db
					.update(trainingSessionsCompleted)
					.set({
						agentId: String(args.agentId),
						agentPrompt: { systemPrompt: String(args.prompt), firstMessage: String(args.firstMessage) },
					})
					.where(eq(trainingSessionsCompleted.id, existingSessionId));
				return { sessionId: existingSessionId } as any;
			},
		},
		{
			name: "get_signed_url",
			description: "Get a signed URL for the ElevenLabs agent conversation.",
			inputSchema: { type: "object", properties: { agentId: { type: "string" } }, required: ["agentId"] },
			handler: async (args: any): Promise<JsonValue> => {
				const signedUrlResponse = await elevenlabsConversational.getSignedUrl(String(args.agentId), false);
				return { signedUrl: signedUrlResponse.signedUrl } as any;
			},
		},
		{
			name: "fetch_battle_card",
			description: "Fetch a battle card linked to a scenario, if any.",
			inputSchema: { type: "object", properties: { scenarioDbId: { type: "number" } }, required: ["scenarioDbId"] },
			handler: async (args: any): Promise<JsonValue> => {
				const [linkedBattleCard] = await db.select().from(battleCards).where(eq(battleCards.linkedScenarioId, Number(args.scenarioDbId))).limit(1);
				return linkedBattleCard ?? null;
			},
		},
		{
			name: "persist_workflow_result",
			description: "Persist the final workflow result object into workflow_state.result and mark current step as completed.",
			inputSchema: { type: "object", properties: { workflowStateId: { type: "number" }, result: { type: "object" } }, required: ["workflowStateId", "result"] },
			handler: async (args: any, ctx: ToolContext): Promise<JsonValue> => {
				const workflowStateId = Number(args.workflowStateId ?? ctx.workflowStateId);
				await db
					.update(workflowState)
					.set({
						result: args.result,
						currentStep: "completed",
						updatedAt: new Date(),
					})
					.where(eq(workflowState.id, workflowStateId));
				return { ok: true } as any;
			},
		},
	];

	return tools;
}
