/**
 * WorkflowOrchestrationService
 *
 * Orchestrates workflow step execution for training session creation.
 * Handles persona generation, agent creation, and signed URL retrieval.
 */

import { db } from "#/data";
import { workflowState, workflowStepRuns } from "#/data/schema";
import { eq } from "drizzle-orm";
import { logger } from "#/lib/logger";
import { PersonaGenerationService } from "#/services/PersonaGenerationService";
import { getRoleplayPersonaGeneratorService } from "#/services/RoleplayPersonaGeneratorService";
import elevenlabsConversational from "#/vantage/elevenlabsConversational";
import { flagDetailsData } from "#/vantage/training";
import {
	trainingScenarios,
	trainingSessionsCompleted,
	flags,
	battleCards,
} from "#/data/schema";
import { and } from "drizzle-orm";

export interface WorkflowStepResult {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
}

export class WorkflowOrchestrationService {
	/**
	 * Execute a workflow by its state ID
	 */
	static async executeWorkflow(workflowStateId: number): Promise<void> {
		const workflow = await db.select().from(workflowState).where(eq(workflowState.id, workflowStateId)).limit(1);

		if (workflow.length === 0) {
			throw new Error(`Workflow state ${workflowStateId} not found`);
		}

		const state = workflow[0];

		// Update workflow status to processing
		await db
			.update(workflowState)
			.set({
				status: "processing",
				updatedAt: new Date(),
			})
			.where(eq(workflowState.id, workflowStateId));

		try {
			if (state.workflowType === "scenario_session") {
				await this.executeScenarioSessionWorkflow(state);
			} else if (state.workflowType === "flag_session") {
				await this.executeFlagSessionWorkflow(state);
			} else {
				throw new Error(`Unknown workflow type: ${state.workflowType}`);
			}

			// Mark workflow as completed
			await db
				.update(workflowState)
				.set({
					status: "completed",
					completedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(workflowState.id, workflowStateId));

			logger.info({ workflowStateId, workflowType: state.workflowType }, "Workflow completed successfully");
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";

			// Mark workflow as failed
			await db
				.update(workflowState)
				.set({
					status: "failed",
					error: errorMessage,
					updatedAt: new Date(),
				})
				.where(eq(workflowState.id, workflowStateId));

			logger.error({ workflowStateId, workflowType: state.workflowType, error: errorMessage }, "Workflow failed");

			throw error;
		}
	}

	/**
	 * Execute scenario session workflow
	 */
	private static async executeScenarioSessionWorkflow(state: typeof workflowState.$inferSelect): Promise<void> {
		const metadata = state.metadata ?? {};
		const salespersonId = metadata.salespersonId as number | undefined;
		const scenarioId = metadata.scenarioId as number | string | undefined;

		if (!salespersonId || !scenarioId) {
			throw new Error("Missing required metadata: salespersonId or scenarioId");
		}

		// Step 1: Get scenario details
		const step1Result = await this.executeStep(state.id, "get_scenario", async () => {
			const isNumericId = typeof scenarioId === "number" || /^\d+$/.test(String(scenarioId));
			const scenarios = isNumericId
				? await db
						.select()
						.from(trainingScenarios)
						.where(eq(trainingScenarios.id, typeof scenarioId === "number" ? scenarioId : parseInt(String(scenarioId), 10)))
						.limit(1)
				: await db.select().from(trainingScenarios).where(eq(trainingScenarios.scenarioId, String(scenarioId))).limit(1);

			if (scenarios.length === 0) {
				throw new Error("Scenario not found");
			}

			return { scenario: scenarios[0] };
		});

		if (!step1Result.success || !step1Result.data?.scenario) {
			throw new Error(step1Result.error ?? "Failed to retrieve scenario");
		}
		const scenario = step1Result.data.scenario as typeof trainingScenarios.$inferSelect;

		// Step 2: Check for existing session
		const step2Result = await this.executeStep(state.id, "check_existing_session", async () => {
			const session = await db.query.trainingSessionsCompleted.findFirst({
				where: and(
					eq(trainingSessionsCompleted.scenarioId, scenario.id),
					eq(trainingSessionsCompleted.salespersonId, salespersonId),
					eq(trainingSessionsCompleted.status, "in_progress"),
				),
			});

			return { session };
		});

		if (!step2Result.success) {
			throw new Error(step2Result.error ?? "Failed to check existing session");
		}
		const existingSession = step2Result.data?.session as typeof trainingSessionsCompleted.$inferSelect | null | undefined;

		// Step 3: Generate persona or reuse agent
		let agentId: string;
		let sessionId: number;

		if (existingSession?.agentId) {
			logger.info({ scenarioId, salespersonId, agentId: existingSession.agentId }, "Reusing existing agent");
			agentId = existingSession.agentId;
			sessionId = existingSession.id;
		} else {
			// Step 3a: Generate persona
			const step3aResult = await this.executeStep(state.id, "generate_persona", async () => {
				const elevenLabsConfig = await PersonaGenerationService.generateElevenLabsConfig(scenario.id, salespersonId);
				return { elevenLabsConfig };
			});

			if (!step3aResult.success || !step3aResult.data?.elevenLabsConfig) {
				throw new Error(step3aResult.error ?? "Failed to generate persona");
			}
			const elevenLabsConfig = step3aResult.data.elevenLabsConfig as { prompt: string; first_message: string };

			// Step 3b: Create ElevenLabs agent
			const step3bResult = await this.executeStep(state.id, "create_agent", async () => {
				const agentResult = await elevenlabsConversational.createTrainingAgent(
					elevenLabsConfig.prompt,
					elevenLabsConfig.first_message,
				);
				return { agentId: agentResult.agentId };
			});

			if (!step3bResult.success || !step3bResult.data?.agentId) {
				throw new Error(step3bResult.error ?? "Failed to create agent");
			}
			agentId = step3bResult.data.agentId as string;

			// Step 3c: Store session
			const step3cResult = await this.executeStep(state.id, "store_session", async () => {
				if (!existingSession) {
					const [newSession] = await db
						.insert(trainingSessionsCompleted)
						.values({
							scenarioId: scenario.id,
							salespersonId,
							agentId,
							agentPrompt: {
								systemPrompt: elevenLabsConfig.prompt,
								firstMessage: elevenLabsConfig.first_message,
							},
							status: "in_progress",
						})
						.returning();
					return { sessionId: newSession.id };
				} else {
					await db
						.update(trainingSessionsCompleted)
						.set({
							agentId,
							agentPrompt: {
								systemPrompt: elevenLabsConfig.prompt,
								firstMessage: elevenLabsConfig.first_message,
							},
						})
						.where(eq(trainingSessionsCompleted.id, existingSession.id));
					return { sessionId: existingSession.id };
				}
			});

			if (!step3cResult.success || !step3cResult.data?.sessionId) {
				throw new Error(step3cResult.error ?? "Failed to store session");
			}
			sessionId = step3cResult.data.sessionId as number;
		}

		// Step 4: Get signed URL
		const step4Result = await this.executeStep(state.id, "get_signed_url", async () => {
			const signedUrlResponse = await elevenlabsConversational.getSignedUrl(agentId, false);
			return { signedUrl: signedUrlResponse.signedUrl };
		});

		if (!step4Result.success || !step4Result.data?.signedUrl) {
			throw new Error(step4Result.error ?? "Failed to get signed URL");
		}
		const signedUrl = step4Result.data.signedUrl as string;

		// Step 5: Fetch battle card
		const step5Result = await this.executeStep(state.id, "fetch_battle_card", async () => {
			const [linkedBattleCard] = await db.select().from(battleCards).where(eq(battleCards.linkedScenarioId, scenario.id)).limit(1);
			return { battleCard: linkedBattleCard ?? null };
		});

		// Update workflow result
		await db
			.update(workflowState)
			.set({
				result: {
					agentId,
					signedUrl,
					sessionId,
					scenario,
					battleCard: step5Result.data?.battleCard ?? null,
				},
				currentStep: "completed",
				updatedAt: new Date(),
			})
			.where(eq(workflowState.id, state.id));
	}

	/**
	 * Execute flag session workflow
	 */
	private static async executeFlagSessionWorkflow(state: typeof workflowState.$inferSelect): Promise<void> {
		const metadata = state.metadata ?? {};
		const flagId = metadata.flagId as number | undefined;

		if (!flagId) {
			throw new Error("Missing required metadata: flagId");
		}

		// Step 1: Get flag details
		const step1Result = await this.executeStep(state.id, "get_flag_details", async () => {
			const flagDetails = await flagDetailsData(flagId);
			if (!flagDetails) {
				throw new Error("Flag not found");
			}
			return { flagDetails };
		});

		if (!step1Result.success || !step1Result.data?.flagDetails) {
			throw new Error(step1Result.error ?? "Failed to retrieve flag details");
		}
		const flagDetails = step1Result.data.flagDetails as Awaited<ReturnType<typeof flagDetailsData>>;
		if (!flagDetails) {
			throw new Error("Flag details is null");
		}

		// Step 2: Get or generate persona
		let storedPrompt = flagDetails.flag.agentPrompt as { systemPrompt: string; firstMessage: string; metadata?: unknown } | null;

		if (!storedPrompt) {
			const step2Result = await this.executeStep(state.id, "generate_persona", async () => {
				const roleplayService = getRoleplayPersonaGeneratorService();
				if (!roleplayService) {
					throw new Error("Roleplay service not available");
				}

				const transcript = flagDetails.interaction?.v1_raw_google_diarized ?? null;
				const companyId = flagDetails.salesperson?.salesperson?.companyId ?? null;

				const flagData = flagDetails.flag.flagData;
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
									prospect_quote: flagData.transcript_segment?.join("\n") ?? "",
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

				// Save to flag
				await db
					.update(flags)
					.set({ agentPrompt: generatedPrompt as (typeof flags.$inferSelect)["agentPrompt"] })
					.where(eq(flags.id, flagId));

				return { prompt: generatedPrompt };
			});

			if (!step2Result.success || !step2Result.data?.prompt) {
				throw new Error(step2Result.error ?? "Failed to generate persona");
			}
			storedPrompt = step2Result.data.prompt as { systemPrompt: string; firstMessage: string; metadata?: unknown };
		}

		// Step 3: Create or reuse agent
		let agentId: string;

		if (flagDetails.flag.agentId) {
			logger.info({ flagId, agentId: flagDetails.flag.agentId }, "Reusing existing agent");
			agentId = flagDetails.flag.agentId;
		} else {
			if (!storedPrompt) {
				throw new Error("Stored prompt is required to create agent");
			}
			const step3Result = await this.executeStep(state.id, "create_agent", async () => {
				const agentResult = await elevenlabsConversational.createTrainingAgent(
					storedPrompt.systemPrompt,
					storedPrompt.firstMessage,
				);
				agentId = agentResult.agentId;

				// Store agent ID in database
				await db.update(flags).set({ agentId }).where(eq(flags.id, flagId));

				return { agentId };
			});

			if (!step3Result.success || !step3Result.data?.agentId) {
				throw new Error(step3Result.error ?? "Failed to create agent");
			}
			agentId = step3Result.data.agentId as string;
		}

		// Step 4: Get signed URL
		const step4Result = await this.executeStep(state.id, "get_signed_url", async () => {
			const signedUrlResponse = await elevenlabsConversational.getSignedUrl(agentId, false);
			return { signedUrl: signedUrlResponse.signedUrl };
		});

		if (!step4Result.success || !step4Result.data?.signedUrl) {
		if (!storedPrompt) {
			throw new Error("Stored prompt is required");
		}
			throw new Error(step4Result.error ?? "Failed to get signed URL");
		}
		if (!flagDetails.salesperson?.salesperson) {
			throw new Error("Salesperson data is missing");
		}
		const signedUrl = step4Result.data.signedUrl as string;

		// Extract prospect data
		if (!storedPrompt) {
			throw new Error("Stored prompt is required");
		}
		const storedMetadata = storedPrompt.metadata as
			| { prospect?: { name: string; role: string; company: string; industry: string } }
			| undefined;
		const prospectData = storedMetadata?.prospect ?? null;

		// Update workflow result
		await db
			.update(workflowState)
			.set({
				result: {
					signedUrl,
					agentId,
					flag: flagDetails.flag,
					interaction: flagDetails.interaction,
					salesperson: flagDetails.salesperson.salesperson,
					prospectData,
				},
				currentStep: "completed",
				updatedAt: new Date(),
			})
			.where(eq(workflowState.id, state.id));
	}

	/**
	 * Execute a single workflow step with tracking
	 */
	private static async executeStep(
		workflowStateId: number,
		stepName: string,
		stepFn: () => Promise<Record<string, unknown>>,
	): Promise<WorkflowStepResult> {
		const startTime = Date.now();

		// Create step run record
		const [stepRun] = await db
			.insert(workflowStepRuns)
			.values({
				workflowStateId,
				stepName,
				status: "running",
				startedAt: new Date(),
			})
			.returning();

		// Update workflow current step
		await db
			.update(workflowState)
			.set({
				currentStep: stepName,
				updatedAt: new Date(),
			})
			.where(eq(workflowState.id, workflowStateId));

		try {
			const outputData = await stepFn();
			const durationMs = Date.now() - startTime;

			// Update step run as completed
			await db
				.update(workflowStepRuns)
				.set({
					status: "completed",
					outputData,
					completedAt: new Date(),
					durationMs,
				})
				.where(eq(workflowStepRuns.id, stepRun.id));

			logger.info({ workflowStateId, stepName, durationMs }, "Workflow step completed");

			return { success: true, data: outputData };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			const durationMs = Date.now() - startTime;

			// Update step run as failed
			await db
				.update(workflowStepRuns)
				.set({
					status: "failed",
					error: errorMessage,
					completedAt: new Date(),
					durationMs,
				})
				.where(eq(workflowStepRuns.id, stepRun.id));

			logger.error({ workflowStateId, stepName, error: errorMessage, durationMs }, "Workflow step failed");

			return { success: false, error: errorMessage };
		}
	}
}

