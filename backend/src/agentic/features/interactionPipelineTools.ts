import type { ToolDefinition, ToolContext } from "#/agentic/types";
import {
	loadInteractionContext,
	loadAnalysisPrompts,
	runBranchedAnalysis,
	persistRating,
	persistFlags,
	persistExtraction,
	persistPersona,
} from "#/services/InteractionProcessingService";

export function getInteractionPipelineTools(): ToolDefinition[] {
	return [
		{
			name: "load_interaction_context",
			description:
				"Load interaction transcript text, associated salesperson/company IDs, and formatted company context (if available). Side-effect free.",
			inputSchema: {
				type: "object",
				properties: {
					interactionId: { type: "number", description: "Interaction ID to load" },
				},
				required: ["interactionId"],
			},
			handler: async (input: { interactionId: number }, _ctx: ToolContext) => {
				return loadInteractionContext({ interactionId: input.interactionId });
			},
		},
		{
			name: "load_analysis_prompts",
			description:
				"Load the current prompt variants (rating/flagging/extraction/persona) using DB overrides with fallbacks. Side-effect free.",
			inputSchema: { type: "object", properties: {}, required: [] },
			handler: async (_input: Record<string, never>, _ctx: ToolContext) => {
				return loadAnalysisPrompts();
			},
		},
		{
			name: "run_branched_analysis",
			description:
				"Run the cached branched+roleplay analysis (LLM). Returns rating, flagging, extraction, personaWithRoleplay. No DB writes.",
			inputSchema: {
				type: "object",
				properties: {
					interactionId: { type: "number" },
					textToAnalyze: { type: "string" },
					companyContextFormatted: { type: "string" },
					prompts: {
						type: "object",
						properties: {
							ratingPromptText: { type: "string" },
							flaggingPromptText: { type: "string" },
							extractionPromptText: { type: "string" },
							personaPromptText: { type: "string" },
						},
						required: ["ratingPromptText", "flaggingPromptText", "extractionPromptText", "personaPromptText"],
					},
				},
				required: ["interactionId", "textToAnalyze", "prompts"],
			},
			handler: async (
				input: {
					interactionId: number;
					textToAnalyze: string;
					companyContextFormatted?: string;
					prompts: {
						ratingPromptText: string;
						flaggingPromptText: string;
						extractionPromptText: string;
						personaPromptText: string;
					};
				},
				_ctx: ToolContext,
			) => {
				return runBranchedAnalysis({
					interactionId: input.interactionId,
					textToAnalyze: input.textToAnalyze,
					companyContextFormatted: input.companyContextFormatted,
					prompts: input.prompts,
				});
			},
		},
		{
			name: "persist_rating",
			description: "Persist a rating result for an interaction (DB write).",
			inputSchema: {
				type: "object",
				properties: {
					interactionId: { type: "number" },
					overallRating: { type: "number", description: "Overall rating numeric value to store" },
				},
				required: ["interactionId", "overallRating"],
			},
			handler: async (input: { interactionId: number; overallRating: number }, _ctx: ToolContext) => {
				return persistRating({ interactionId: input.interactionId, overallRating: input.overallRating });
			},
		},
		{
			name: "persist_flags",
			description: "Persist flag objects for an interaction (DB write). Optionally attach matching roleplay prompts.",
			inputSchema: {
				type: "object",
				properties: {
					interactionId: { type: "number" },
					salespersonId: { type: "number", description: "Salesperson ID (optional)" },
					flags: { type: "array", items: { type: "object" } },
					flagRoleplays: { type: "array", items: { type: "object" } },
				},
				required: ["interactionId", "flags"],
			},
			handler: async (
				input: { interactionId: number; salespersonId: number | null; flags: any[]; flagRoleplays?: any[] },
				_ctx: ToolContext,
			) => {
				return persistFlags({
					interactionId: input.interactionId,
					salespersonId: input.salespersonId ?? null,
					flags: input.flags,
					flagRoleplays: input.flagRoleplays ?? [],
				});
			},
		},
		{
			name: "persist_extraction",
			description: "Persist extraction result for an interaction (DB write).",
			inputSchema: {
				type: "object",
				properties: {
					interactionId: { type: "number" },
					companyId: { type: "number" },
					extraction: { type: "object" },
				},
				required: ["interactionId", "companyId", "extraction"],
			},
			handler: async (input: { interactionId: number; companyId: number; extraction: any }, _ctx: ToolContext) => {
				return persistExtraction({ interactionId: input.interactionId, companyId: input.companyId, extraction: input.extraction });
			},
		},
		{
			name: "persist_persona",
			description: "Persist call persona result for an interaction (DB write).",
			inputSchema: {
				type: "object",
				properties: {
					interactionId: { type: "number" },
					companyId: { type: "number" },
					persona: { type: "object" },
				},
				required: ["interactionId", "companyId", "persona"],
			},
			handler: async (input: { interactionId: number; companyId: number; persona: any }, _ctx: ToolContext) => {
				return persistPersona({ interactionId: input.interactionId, companyId: input.companyId, persona: input.persona });
			},
		},
	];
}
