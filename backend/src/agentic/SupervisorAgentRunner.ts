import * as fs from "node:fs";
import * as path from "node:path";
import { getAnthropicClient } from "#/lib/anthropic";
import { logger } from "#/lib/logger";
import type { ToolContext, AgenticRunConfig, AgenticTraceEvent, JsonValue } from "./types";
import { ToolRegistry } from "./ToolRegistry";
import { AgentRunner } from "./AgentRunner";

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

let SUPER_PROMPT_CACHE: string | null = null;
function getSupervisorSuperPrompt(): string {
	if (SUPER_PROMPT_CACHE) return SUPER_PROMPT_CACHE;

	// Resolve at runtime so this works in ts-node and compiled JS.
	// __dirname points to backend/src/agentic in TS runtime; in dist it will be dist/agentic.
	const candidatePaths = [
		path.join(__dirname, "prompts", "SUPERVISOR_SUPERPROMPT.md"),
		path.join(process.cwd(), "backend", "src", "agentic", "prompts", "SUPERVISOR_SUPERPROMPT.md"),
	];

	for (const p of candidatePaths) {
		try {
			if (fs.existsSync(p)) {
				SUPER_PROMPT_CACHE = fs.readFileSync(p, "utf8");
				return SUPER_PROMPT_CACHE;
			}
		} catch {
			// ignore and keep searching
		}
	}

	// Safe fallback to avoid hard failure if file missing in some environments.
	SUPER_PROMPT_CACHE =
		"Supervisor Agent: coordinate planner/executor/verifier sub-agents; enforce allowlisted tools; output JSON; no hallucinations.";
	return SUPER_PROMPT_CACHE;
}



let FEATURE_PROMPT_CACHE: Record<string, string> = {};
function getFeaturePrompt(featureKey?: string): string {
	if (!featureKey) return "";
	if (FEATURE_PROMPT_CACHE[featureKey]) return FEATURE_PROMPT_CACHE[featureKey];

	// Feature prompt files live under prompts/features.
	const fname = featureKey.endsWith(".md") ? featureKey : `${featureKey}.md`;
	const candidatePaths = [
		path.join(__dirname, "prompts", "features", fname),
		path.join(process.cwd(), "backend", "src", "agentic", "prompts", "features", fname),
	];

	for (const p of candidatePaths) {
		try {
			if (fs.existsSync(p)) {
				FEATURE_PROMPT_CACHE[featureKey] = fs.readFileSync(p, "utf8");
				return FEATURE_PROMPT_CACHE[featureKey];
			}
		} catch {
			// ignore and keep searching
		}
	}

	// Safe fallback if missing: keep empty so the super prompt still works.
	FEATURE_PROMPT_CACHE[featureKey] = "";
	return "";
}
type RunParamsLegacy = {
	config: AgenticRunConfig;
	toolRegistry: ToolRegistry;
	ctx: ToolContext;
	systemBase: string;
	goal: string;
	outputShapeHint: string;
	assessmentRubricEnabled?: boolean;
};

type RunParamsNew = {
	config: AgenticRunConfig;
	toolRegistry: ToolRegistry;
	ctx: ToolContext;
	/** Plain-English feature instructions (optional). */
	system?: string;
	/** Optional feature prompt key (loads prompts/features/<key>.md). */
	featureKey?: string;
	/** The user/system goal for this run. */
	userPrompt: string;
	/** Optional hint for the final JSON shape. */
	outputShapeHint?: string;
	assessmentRubricEnabled?: boolean;
};

type RunParams = RunParamsLegacy | RunParamsNew;

function normalizeParams(params: RunParams): {
	config: AgenticRunConfig;
	toolRegistry: ToolRegistry;
	ctx: ToolContext;
	featureSystem: string;
	featureKey?: string;
	goal: string;
	outputShapeHint: string;
	assessmentRubricEnabled: boolean;
} {
	const assessmentRubricEnabled = (params as any).assessmentRubricEnabled ?? true;

	// Legacy callers
	if ((params as any).systemBase && (params as any).goal) {
		return {
			config: (params as any).config,
			toolRegistry: (params as any).toolRegistry,
			ctx: (params as any).ctx,
			featureSystem: (params as any).systemBase,
			goal: (params as any).goal,
			outputShapeHint: (params as any).outputShapeHint ?? "Return JSON output.",
			assessmentRubricEnabled,
		};
	}

	// New callers
	return {
		config: (params as any).config,
		toolRegistry: (params as any).toolRegistry,
		ctx: (params as any).ctx,
		featureSystem: (params as any).system ?? "",
		featureKey: (params as any).featureKey,
		goal: (params as any).userPrompt,
		outputShapeHint: (params as any).outputShapeHint ?? "Return JSON output.",
		assessmentRubricEnabled,
	};
}

export class SupervisorAgentRunner {
	/**
	 * Supervisor + sub-agent orchestration:
	 * - The **Super Prompt** (plain English, markdown) defines global governance and quality principles.
	 * - Sub-agent prompts are intentionally minimal and functional/constraint-driven.
	 * - Tools are only available to EXECUTOR and REPAIR (via ToolRegistry + AgentRunner).
	 */
	static async run(params: RunParams): Promise<{ output: JsonValue; trace: AgenticTraceEvent[] }> {
		const { config, toolRegistry, ctx, featureSystem, featureKey, goal, outputShapeHint, assessmentRubricEnabled } = normalizeParams(params);

		const anthropic = getAnthropicClient();
		const trace: AgenticTraceEvent[] = [];

		const superPrompt = getSupervisorSuperPrompt();
		const allowedTools = toolRegistry.getToolNames();

		const baseSystem =
			superPrompt +
			(featureSystem ? `\n\n## Feature Instructions\n${featureSystem}\n` : "") +
			`\n\n## Runtime Constraints\n- Allowed tools: ${JSON.stringify(allowedTools)}\n- Budgets: ${JSON.stringify(config.budgets)}\n` +
			(assessmentRubricEnabled ? "" : "\n- NOTE: Assessment rubric is disabled for this run.\n");

		// 1) PLANNER (no tools): strict plan JSON
		const plannerSystem =
			baseSystem +
			"\n\nROLE: PLANNER\n" +
			"Output only JSON in <plan_json>...</plan_json>.\n" +
			"Plan rules: <= 8 steps; use only allowlisted tools; each step includes stepId, toolName (or null), args, purpose, stopCondition.\n";

		const plannerUser =
			`Goal: ${goal}\n\n` +
			`Output shape hint: ${outputShapeHint}\n\n` +
			"Return the plan now.";

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
			data: { agent: "PLANNER", textPreview: planText.slice(0, 800), usage: (planResp as any).usage ?? null },
		});

		const planJsonRaw = extractBetween(planText, "<plan_json>", "</plan_json>") ?? planText.trim();
		const planParsed = safeJsonParse(planJsonRaw);

		const plan = planParsed && typeof planParsed === "object"
			? (planParsed as any)
			: {
				steps: [
					{
						stepId: "execute",
						toolName: null,
						args: {},
						purpose: "Execute allowlisted tools as needed to fulfill the goal",
						stopCondition: "Final JSON output produced",
					},
				],
			};

		// 2) EXECUTOR (tools enabled): bounded tool-using loop with plan context
		const executorSystem =
			baseSystem +
			"\n\nROLE: EXECUTOR\n" +
			"You may call tools. Follow the plan; if a step cannot be completed, explain why in JSON and stop.\n" +
			"Always ground outputs in tool results. Do not invent IDs/URLs.\n";

		const executorUser =
			`Goal: ${goal}\n\n` +
			`Plan: ${JSON.stringify(plan)}\n\n` +
			`Output shape hint: ${outputShapeHint}\n\n` +
			"Proceed. When you are ready to finalize, return a single JSON object.";

		const execRes = await AgentRunner.run({
			config,
			toolRegistry,
			ctx,
			system: executorSystem,
			userPrompt: executorUser,
		});

		trace.push(...execRes.trace);

		// 3) VERIFIER (no tools): correctness + schema + rubric checks when relevant
		const verifierSystem =
			baseSystem +
			"\n\nROLE: VERIFIER\n" +
			"You cannot call tools. Verify the candidate output against the goal, constraints, and output shape hint.\n" +
			"Return ONLY JSON in <verify_json>...</verify_json> with: { pass: boolean, issues: string[], requiredFixes: string[] }.\n";

		const verifierUser =
			`Goal: ${goal}\n\n` +
			`Output shape hint: ${outputShapeHint}\n\n` +
			`Candidate output JSON: ${JSON.stringify(execRes.output)}\n\n` +
			"Verify now.";

		const verifyResp = await anthropic.messages.create({
			model: config.model,
			temperature: 0.1,
			max_tokens: 900,
			system: verifierSystem,
			messages: [{ role: "user", content: verifierUser }] as any,
		});

		const verifyText = ((verifyResp as any).content ?? [])
			.map((b: any) => (b?.type === "text" ? b.text : ""))
			.join("\n");

		trace.push({
			ts: isoNow(),
			type: "SUB_AGENT",
			data: { agent: "VERIFIER", textPreview: verifyText.slice(0, 800), usage: (verifyResp as any).usage ?? null },
		});

		const verifyJsonRaw = extractBetween(verifyText, "<verify_json>", "</verify_json>") ?? verifyText.trim();
		const verifyParsed = safeJsonParse(verifyJsonRaw) as any;

		const pass = !!verifyParsed?.pass;
		const requiredFixes: string[] = Array.isArray(verifyParsed?.requiredFixes) ? verifyParsed.requiredFixes : [];

		if (pass || requiredFixes.length === 0) {
			return { output: execRes.output, trace };
		}

		// 4) REPAIR (tools enabled, limited): apply verifier-directed fixes, then return revised JSON
		logger.info("SupervisorAgentRunner: verifier failed; attempting repair pass", { requiredFixesCount: requiredFixes.length });

		const repairSystem =
			baseSystem +
			"\n\nROLE: REPAIR\n" +
			"You may call tools. Apply ONLY the required fixes listed. Do not broaden scope.\n" +
			"Return a single corrected JSON object.";

		const repairUser =
			`Goal: ${goal}\n\n` +
			`Required fixes: ${JSON.stringify(requiredFixes)}\n\n` +
			`Current output JSON: ${JSON.stringify(execRes.output)}\n\n` +
			"Apply the fixes and return corrected JSON.";

		const repaired = await AgentRunner.run({
			config: {
				...config,
				budgets: {
					...config.budgets,
					maxIterations: Math.max(2, Math.min(6, config.budgets.maxIterations)),
					maxToolCalls: Math.max(5, Math.min(10, config.budgets.maxToolCalls)),
				},
			},
			toolRegistry,
			ctx,
			system: repairSystem,
			userPrompt: repairUser,
		});

		trace.push(...repaired.trace);

		// Final return after repair (a second verifier pass can be added later if needed)
		return { output: repaired.output, trace };
	}
}
