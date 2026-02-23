import { db } from "#/data";
import { flags, workflowState } from "#/data/schema";
import { eq } from "drizzle-orm";
import elevenlabsConversational from "#/vantage/elevenlabsConversational";
import { flagDetailsData } from "#/vantage/training";
import { getRoleplayPersonaGeneratorService } from "#/services/RoleplayPersonaGeneratorService";
import type { ToolDefinition, ToolContext, JsonValue } from "../types";

export function getFlagSessionTools(): ToolDefinition[] {
	const tools: ToolDefinition[] = [
		{
			name: "get_flag_details",
			description: "Fetch detailed flag data (flag, interaction, salesperson).",
			inputSchema: { type: "object", properties: { flagId: { type: "number" } }, required: ["flagId"] },
			handler: async (args: any): Promise<JsonValue> => {
				const flagId = Number(args.flagId);
				const flagDetails = await flagDetailsData(flagId);
				if (!flagDetails) throw new Error("Flag not found");
				return flagDetails as any;
			},
		},
		{
			name: "generate_roleplay_prompt_from_flag",
			description: "Generate and persist the roleplay agent prompt for a flag (systemPrompt + firstMessage + metadata).",
			inputSchema: { type: "object", properties: { flagId: { type: "number" } }, required: ["flagId"] },
			handler: async (args: any): Promise<JsonValue> => {
				const flagId = Number(args.flagId);
				const roleplayService = getRoleplayPersonaGeneratorService();
				if (!roleplayService) throw new Error("Roleplay service not available");

				const details = await flagDetailsData(flagId);
				if (!details) throw new Error("Flag not found");

				const transcript = details.interaction?.v1_raw_google_diarized ?? null;
				const companyId = details.salesperson?.salesperson?.companyId ?? null;

				const flagData = details.flag.flagData;
				const betterResponseStr = flagData
					? Array.isArray(flagData.better_response)
						? flagData.better_response.join("\n\nOR\n\n")
						: (flagData.better_response ?? "")
					: "";

				const roleplayResult = await roleplayService.generateFromFlag({
					transcript,
					flag: {
						reason: flagData?.flag_title ?? "Training scenario",
						flagData: flagData
							? {
									flag_title: flagData.flag_title ?? "",
									what_happened: flagData.what_happened ?? "",
									prospect_quote: "",
									rep_quote: "",
									what_went_wrong: flagData.revenue_impact ?? "",
									better_response: betterResponseStr,
									timestamps: flagData.timestamps ?? undefined,
								}
							: undefined,
					},
					companyId,
				});

				const generatedPrompt = {
					systemPrompt: roleplayResult.systemPrompt,
					firstMessage: roleplayResult.firstMessage,
					metadata: roleplayResult.metadata,
				};

				await db.update(flags).set({ agentPrompt: generatedPrompt as any }).where(eq(flags.id, flagId));
				return generatedPrompt as any;
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
			name: "persist_flag_agent_id",
			description: "Store the ElevenLabs agentId on the flag record.",
			inputSchema: { type: "object", properties: { flagId: { type: "number" }, agentId: { type: "string" } }, required: ["flagId", "agentId"] },
			handler: async (args: any): Promise<JsonValue> => {
				const flagId = Number(args.flagId);
				const agentId = String(args.agentId);
				await db.update(flags).set({ agentId }).where(eq(flags.id, flagId));
				return { ok: true } as any;
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
