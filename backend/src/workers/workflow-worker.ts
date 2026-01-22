/**
 * Workflow Worker
 *
 * Background worker that polls the workflow queue and executes workflows.
 * Can run as a separate process or as a background task in the main process.
 */

import { WorkflowQueueService } from "#/services/WorkflowQueueService";
import { WorkflowOrchestrationService } from "#/services/WorkflowOrchestrationService";
import { logger } from "#/lib/logger";
import { TIMING } from "#/config";

export class WorkflowWorker {
	private isRunning = false;
	private pollInterval: NodeJS.Timeout | null = null;
	private readonly pollIntervalMs = 2000; // Poll every 2 seconds

	/**
	 * Start the worker
	 */
	start(): void {
		if (this.isRunning) {
			logger.warn("Workflow worker is already running");
			return;
		}

		this.isRunning = true;
		logger.info("Starting workflow worker");

		// Release stale locks on startup
		WorkflowQueueService.releaseStaleLocks().catch((error) => {
			logger.error({ error }, "Failed to release stale locks on startup");
		});

		// Start polling
		this.poll();
	}

	/**
	 * Stop the worker
	 */
	stop(): void {
		if (!this.isRunning) {
			return;
		}

		this.isRunning = false;

		if (this.pollInterval) {
			clearTimeout(this.pollInterval);
			this.pollInterval = null;
		}

		logger.info("Stopped workflow worker");
	}

	/**
	 * Poll for jobs and process them
	 */
	private async poll(): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		try {
			// Release stale locks periodically (every 5 minutes)
			if (Math.random() < 0.01) {
				// ~1% chance per poll = roughly every 5 minutes
				await WorkflowQueueService.releaseStaleLocks();
			}

			// Dequeue next job
			const job = await WorkflowQueueService.dequeue();

			if (job) {
				// Process the job
				await this.processJob(job);
			}
		} catch (error) {
			logger.error({ error }, "Error in workflow worker poll");
		}

		// Schedule next poll
		this.pollInterval = setTimeout(() => {
			this.poll();
		}, this.pollIntervalMs);
	}

	/**
	 * Process a single job
	 */
	private async processJob(job: Awaited<ReturnType<typeof WorkflowQueueService.dequeue>>): Promise<void> {
		if (!job) {
			return;
		}

		const { id: jobId, workflowStateId } = job;

		try {
			logger.info({ jobId, workflowStateId }, "Processing workflow job");

			// Execute the workflow
			await WorkflowOrchestrationService.executeWorkflow(workflowStateId);

			// Mark job as completed
			await WorkflowQueueService.complete(jobId);

			logger.info({ jobId, workflowStateId }, "Workflow job completed successfully");
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			logger.error({ jobId, workflowStateId, error: errorMessage }, "Workflow job failed");

			// Mark job as failed (will retry if attempts < maxAttempts)
			await WorkflowQueueService.fail(jobId, errorMessage);
		}
	}
}

// Singleton instance
let workerInstance: WorkflowWorker | null = null;

/**
 * Get or create the workflow worker instance
 */
export function getWorkflowWorker(): WorkflowWorker {
	if (!workerInstance) {
		workerInstance = new WorkflowWorker();
	}
	return workerInstance;
}

/**
 * Start the workflow worker (for use in main process)
 */
export function startWorkflowWorker(): void {
	const worker = getWorkflowWorker();
	worker.start();
}

/**
 * Stop the workflow worker
 */
export function stopWorkflowWorker(): void {
	if (workerInstance) {
		workerInstance.stop();
	}
}

