import { getAnthropicClient } from "#/lib/anthropic";
import { logger } from "#/lib/logger";
import type { ToolContext, AgenticRunConfig, AgenticTraceEvent, JsonValue } from "./types";
import { ToolRegistry } from "./ToolRegistry";
import { AgentRunner } from "./AgentRunner";

const RUBRIC = "Advanced Sales Assessment System (Rubric for evaluation-style outputs):\n- Evaluate across five integrated dimensions: Behavioral Linguistics; Emotional Intelligence & Psychological Dynamics; Sales Methodology Mastery; Tactical Execution & Technique; Outcome Predictability & Deal Analysis.\n- For each dimension: provide score + strengths + gaps; include evidence (specific quotes or moments) for claims; avoid generic feedback.\n- Produce structured, machine-parseable JSON with sub-scores and a concise executive summary when assessments are requested.";

function isoNow(): string {
	return new Date().toISOString();
}

function safeJsonParse(s: string): unknown | null {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function extractBetween(text: string, startTag: string, endTag: string): string | null {
	const start = text.indexOf(startTag);
	const end = text.lastIndexOf(endTag);
	if (start === -1 || end === -1 || end <= start) return null;
	return text.slice(start + startTag.length, end).trim();
}

export class SupervisorAgentRunner {
	/**
	 * Multi-agent orchestration pattern:
	 * - Supervisor (this class) coordinates sub-agents: Planner -> Executor -> Verifier -> (optional repair) -> Finalizer
	 * - Tools are only available to Executor via ToolRegistry
	 * - Verifier uses the rubric (when assessment-like output is requested) and always enforces schema/consistency checks
	 */
	static async run(params: {
		config: AgenticRunConfig;
		toolRegistry: ToolRegistry;
		ctx: ToolContext;
		systemBase: string;
		goal: string;
		outputShapeHint: string;
		assessmentRubricEnabled?: boolean; // default true
	}): Promise<{ output: JsonValue; trace: AgenticTraceEvent[] }> {
		const { config, toolRegistry, ctx, systemBase, goal, outputShapeHint } = params;
		const assessmentRubricEnabled = params.assessmentRubricEnabled ?? true;

		const anthropic = getAnthropicClient();
		const trace: AgenticTraceEvent[] = [];

		// 1) Planner (no tools): produce a strict JSON plan
		const plannerSystem =
			systemBase +
			"\nYou are the SUPERVISOR PLANNER. Your job is to propose a minimal, safe plan for achieving the goal.\n" +
			"Rules:\n- Output ONLY JSON in <plan_json>...</plan_json>.\n- Plan must reference ONLY allowed tool names.\n- Each step must have: stepId, toolName (or null), args (object), purpose, stopCondition.\n- Keep the plan short (<= 8 steps).\n";

		const allowedTools = toolRegistry.getToolNames();
		const plannerUser =
			`Goal: ${goal}\n\n` +
			`Allowed tools: ${JSON.stringify(allowedTools)}\n\n` +
			`Return a JSON plan that uses only allowed tools.\n` +
			`Output shape hint for the final deliverable: ${outputShapeHint}\n`;

		const planResp = await anthropic.messages.create({
			model: config.model,
			temperature: 0.2,
			max_tokens: 1200,
			system: plannerSystem,
			messages: [{ role: "user", content: plannerUser }] as any,
		});

		const planText = ((planResp as any).content ?? [])
			.map((b: any) => (b?.type === "text" ? b.text : ""))
			.join("\n");

		trace.push({
			ts: isoNow(),
			type: "SUB_AGENT",
			data: {
				agent: "PLANNER",
				textPreview: planText.slice(0, 800),
				usage: (planResp as any).usage ?? null,
			},
		});

		const planJsonRaw = extractBetween(planText, "<plan_json>", "</plan_json>") ?? planText.trim();
		const planParsed = safeJsonParse(planJsonRaw);

		// If planner fails, fall back to a minimal one-step "use tools as needed" plan (still bounded)
		const plan = (planParsed && typeof planParsed === "object") ? planParsed : {
			steps: [
				{ stepId: "execute", toolName: null, args: {}, purpose: "Execute tools as needed to fulfill goal", stopCondition: "Final JSON output produced" },
			],
		};

		// 2) Executor (tools enabled): run bounded tool-using loop but provide the plan explicitly
		const executorSystem =
			systemBase +
			"\nYou are the EXECUTION SUB-AGENT. You must follow the Supervisor plan.\n" +
			"Rules:\n- Use ONLY the provided tools.\n- Never invent IDs.\n- After completing the goal, return ONLY valid JSON in <final_json>...</final_json>.\n";

		const executorUser =
			`Goal: ${goal}\n\n` +
			`Supervisor plan (JSON):\n${JSON.stringify(plan)}\n\n` +
			`Expected final output shape hint: ${outputShapeHint}\n` +
			`Proceed step-by-step. If a step has toolName=null, decide which tool to call next.\n`;

		const exec = await AgentRunner.run({
			config,
			toolRegistry,
			ctx,
			system: executorSystem,
			userPrompt: executorUser,
		});

		trace.push(...exec.trace.map((e) => ({ ...e, data: { ...e.data, subAgent: "EXECUTOR" } })));

		let candidate = exec.output;

		// 3) Verifier (no tools): check schema/completeness and rubric for assessment-style outputs
		const verifierSystem =
			systemBase +
			"\nYou are the VERIFIER SUB-AGENT. You validate the candidate output for correctness, completeness, and compliance.\n" +
			"Rules:\n- Output ONLY JSON in <verify_json>...</verify_json>.\n- If you can repair the JSON deterministically, include correctedOutput.\n- If assessment-like content is present or requested, enforce rubric rules.\n" +
			(assessmentRubricEnabled ? `\nRubric guidance:\n${RUBRIC}\n` : "");

		const verifyUser =
			`Goal: ${goal}\n\n` +
			`Output shape hint: ${outputShapeHint}\n\n` +
			`Candidate JSON: ${JSON.stringify(candidate)}\n\n` +
			`Return: { pass: boolean, issues: string[], correctedOutput?: object }\n`;

		const verifyResp = await anthropic.messages.create({
			model: config.model,
			temperature: 0,
			max_tokens: 1200,
			system: verifierSystem,
			messages: [{ role: "user", content: verifyUser }] as any,
		});

		const verifyText = ((verifyResp as any).content ?? [])
			.map((b: any) => (b?.type === "text" ? b.text : ""))
			.join("\n");

		trace.push({
			ts: isoNow(),
			type: "SUB_AGENT",
			data: {
				agent: "VERIFIER",
				textPreview: verifyText.slice(0, 800),
				usage: (verifyResp as any).usage ?? null,
			},
		});

		const verifyJsonRaw = extractBetween(verifyText, "<verify_json>", "</verify_json>") ?? verifyText.trim();
		const verifyParsed = safeJsonParse(verifyJsonRaw) as any;

		if (verifyParsed && verifyParsed.pass === false) {
			const corrected = verifyParsed.correctedOutput;
			if (corrected && typeof corrected === "object") {
				candidate = corrected as JsonValue;
			} else {
				// One repair attempt via executor with issues appended
				const repairUser =
					`Goal: ${goal}\n\n` +
					`The verifier found issues:\n${JSON.stringify(verifyParsed.issues ?? [])}\n\n` +
					`Current candidate JSON:\n${JSON.stringify(candidate)}\n\n` +
					`Fix the issues and return ONLY valid JSON in <final_json>...</final_json>.\n` +
					`Output shape hint: ${outputShapeHint}\n`;

				const repaired = await AgentRunner.run({
					config: { ...config, budgets: { ...config.budgets, maxIterations: Math.max(3, Math.min(6, config.budgets.maxIterations)) } },
					toolRegistry,
					ctx,
					system: executorSystem,
					userPrompt: repairUser,
				});

				trace.push(...repaired.trace.map((e) => ({ ...e, data: { ...e.data, subAgent: "EXECUTOR_REPAIR" } })));
				candidate = repaired.output;
			}
		}

		trace.push({
			ts: isoNow(),
			type: "FINAL_OUTPUT",
			data: { supervisor: true },
		});

		return { output: candidate as JsonValue, trace };
	}
}
