import { ANTHROPIC_MODEL } from "#/lib/anthropic";
import { logger } from "#/lib/logger";
import type { ToolContext } from "#/agentic/types";
import { AgentRunner } from "#/agentic/AgentRunner";
import { ToolRegistry } from "#/agentic/ToolRegistry";
import { getScenarioSessionTools } from "#/agentic/workflows/scenarioSessionTools";
import { getFlagSessionTools } from "#/agentic/workflows/flagSessionTools";

const SYSTEM_PROMPT = "You are an agentic workflow orchestrator running inside a backend service.\nYou must achieve the user goal by calling the provided tools.\nRules:\n- Use only the tools provided.\n- Prefer reuse of existing records when possible, if allowed by the metadata.\n- Never invent IDs; always retrieve them via tools.\n- Keep tool inputs minimal and valid.\n- After completing the goal, return ONLY valid JSON in <final_json>...</final_json> matching the requested output shape.";

export class AgenticWorkflowOrchestrationService {
	static async runScenarioSession(params: {
		workflowStateId: number;
		workflowId: string;
		metadata: Record<string, unknown>;
	}): Promise<{ output: any; trace: any[] }> {
		const toolRegistry = new ToolRegistry(getScenarioSessionTools());
		const ctx: ToolContext = {
			workflowStateId: params.workflowStateId,
			workflowType: "scenario_session",
			workflowId: params.workflowId,
			metadata: params.metadata,
		};

		const salespersonId = params.metadata.salespersonId as number | undefined;
		const scenarioId = params.metadata.scenarioId as number | string | undefined;
		if (!salespersonId || !scenarioId) throw new Error("Missing required metadata: salespersonId or scenarioId");

		const allowReuse = params.metadata.allowReuse !== false;
		const maxIterations = Number(params.metadata.maxIterations ?? 10);

		const userPrompt = [
			"Goal: Start or reuse a training scenario session and return agentId, signedUrl, sessionId, scenario, and optional battleCard.",
			`Inputs: scenarioId={scenarioId}, salespersonId={salespersonId}, allowReuse={allowReuse}.`,
			"Requirements:",
			"- If allowReuse is true, reuse any in-progress session with an existing agentId.",
			"- Otherwise, generate persona config, create agent, store session, and fetch signed URL.",
			"- Always fetch the scenario and battle card (if present).",
			"- Persist the final result via persist_workflow_result.",
			"Final JSON shape:",
			"{ agentId: string, signedUrl: string, sessionId: number, scenario: object, battleCard: object|null }",
		].join("\n")
			.replace("{scenarioId}", String(scenarioId))
			.replace("{salespersonId}", String(salespersonId))
			.replace("{allowReuse}", String(allowReuse));

		const res = await AgentRunner.run({
			config: {
				model: ANTHROPIC_MODEL,
				temperature: 0.2,
				budgets: {
					maxIterations: Math.max(3, Math.min(20, maxIterations)),
					maxToolCalls: 30,
					maxTimeMs: 90_000,
				},
			},
			toolRegistry,
			ctx,
			system: SYSTEM_PROMPT,
			userPrompt,
		});

		return res as any;
	}

	static async runFlagSession(params: {
		workflowStateId: number;
		workflowId: string;
		metadata: Record<string, unknown>;
	}): Promise<{ output: any; trace: any[] }> {
		const toolRegistry = new ToolRegistry(getFlagSessionTools());
		const ctx: ToolContext = {
			workflowStateId: params.workflowStateId,
			workflowType: "flag_session",
			workflowId: params.workflowId,
			metadata: params.metadata,
		};

		const flagId = params.metadata.flagId as number | undefined;
		if (!flagId) throw new Error("Missing required metadata: flagId");

		const maxIterations = Number(params.metadata.maxIterations ?? 10);
		const allowReuse = params.metadata.allowReuse !== false;

		const userPrompt = [
			"Goal: Start or reuse a training flag session and return signedUrl, agentId, flag, interaction, salesperson, and optional prospectData.",
			`Inputs: flagId={flagId}, allowReuse={allowReuse}.`,
			"Requirements:",
			"- Fetch flag details.",
			"- If flag already has agentId and allowReuse is true, reuse it.",
			"- Otherwise, ensure agentPrompt exists (generate and persist it), create a new agent, and persist agentId on the flag.",
			"- Always fetch signedUrl for the agentId.",
			"- Persist final result via persist_workflow_result.",
			"Final JSON shape:",
			"{ signedUrl: string, agentId: string, flag: object, interaction: object|null, salesperson: object, prospectData: object|null }",
		].join("\n")
			.replace("{flagId}", String(flagId))
			.replace("{allowReuse}", String(allowReuse));

		const res = await AgentRunner.run({
			config: {
				model: ANTHROPIC_MODEL,
				temperature: 0.2,
				budgets: {
					maxIterations: Math.max(3, Math.min(20, maxIterations)),
					maxToolCalls: 30,
					maxTimeMs: 90_000,
				},
			},
			toolRegistry,
			ctx,
			system: SYSTEM_PROMPT,
			userPrompt,
		});

		return res as any;
	}
}
