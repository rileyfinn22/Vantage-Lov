/**
 * WorkflowQueueService
 *
 * DB-backed job queue service for workflow orchestration.
 * Handles enqueueing, dequeuing, locking, and retry logic.
 */

import { db } from "#/data";
import { workflowQueue, workflowState } from "#/data/schema";
import { eq, and, lte, desc } from "drizzle-orm";
import { logger } from "#/lib/logger";

export interface QueueJob {
	id: number;
	workflowStateId: number;
	priority: number;
	attempts: number;
	maxAttempts: number;
	scheduledAt: Date;
}

export class WorkflowQueueService {
	/**
	 * Generate unique worker identifier (hostname + pid)
	 */
	private static getWorkerId(): string {
		const hostname = process.env.HOSTNAME || "unknown";
		const pid = process.pid;
		return `${hostname}-${pid}`;
	}

	/**
	 * Enqueue a workflow job
	 */
	static async enqueue(workflowStateId: number, priority = 0, scheduledAt?: Date): Promise<void> {
		try {
			await db.insert(workflowQueue).values({
				workflowStateId,
				priority,
				scheduledAt: scheduledAt ?? new Date(),
				status: "pending",
			});

			logger.info({ workflowStateId, priority }, "Enqueued workflow job");
		} catch (error) {
			// If unique constraint violation, job already exists - that's okay
			if (error instanceof Error && error.message.includes("unique")) {
				logger.debug({ workflowStateId }, "Workflow job already enqueued");
				return;
			}
			throw error;
		}
	}

	/**
	 * Dequeue next available job (with locking)
	 * Returns null if no jobs available
	 */
	static async dequeue(): Promise<QueueJob | null> {
		const workerId = this.getWorkerId();
		const now = new Date();

		// Find and lock the next available job
		// Use a transaction to ensure atomicity
		const result = await db.transaction(async (tx) => {
			// Find next pending job that's scheduled
			const availableJobs = await tx
				.select()
				.from(workflowQueue)
				.where(
					and(
						eq(workflowQueue.status, "pending"),
						lte(workflowQueue.scheduledAt, now),
					),
				)
				.orderBy(desc(workflowQueue.priority), workflowQueue.scheduledAt)
				.limit(1)
				.for("update"); // Lock row for update

			if (availableJobs.length === 0) {
				return null;
			}

			const job = availableJobs[0];

			// Lock the job
			await tx
				.update(workflowQueue)
				.set({
					status: "locked",
					lockedAt: now,
					lockedBy: workerId,
				})
				.where(eq(workflowQueue.id, job.id));

			return job;
		});

		if (result) {
			logger.info({ jobId: result.id, workflowStateId: result.workflowStateId, workerId }, "Dequeued workflow job");
		}

		return result;
	}

	/**
	 * Mark job as completed
	 */
	static async complete(jobId: number): Promise<void> {
		await db
			.update(workflowQueue)
			.set({
				status: "completed",
			})
			.where(eq(workflowQueue.id, jobId));

		logger.info({ jobId }, "Marked workflow job as completed");
	}

	/**
	 * Mark job as failed (and retry if attempts < maxAttempts)
	 */
	static async fail(jobId: number, error: string): Promise<void> {
		const job = await db.select().from(workflowQueue).where(eq(workflowQueue.id, jobId)).limit(1);

		if (job.length === 0) {
			logger.warn({ jobId }, "Job not found for failure marking");
			return;
		}

		const currentJob = job[0];
		const newAttempts = currentJob.attempts + 1;

		if (newAttempts >= currentJob.maxAttempts) {
			// Max attempts reached - mark as permanently failed
			await db
				.update(workflowQueue)
				.set({
					status: "failed",
				})
				.where(eq(workflowQueue.id, jobId));

			// Also mark workflow state as failed
			await db
				.update(workflowState)
				.set({
					status: "failed",
					error,
					updatedAt: new Date(),
				})
				.where(eq(workflowState.id, currentJob.workflowStateId));

			logger.error(
				{ jobId, workflowStateId: currentJob.workflowStateId, attempts: newAttempts, error },
				"Workflow job permanently failed",
			);
		} else {
			// Retry - unlock and reschedule with exponential backoff
			const backoffMs = Math.min(1000 * Math.pow(2, newAttempts - 1), 60000); // Max 60 seconds
			const scheduledAt = new Date(Date.now() + backoffMs);

			await db
				.update(workflowQueue)
				.set({
					status: "pending",
					attempts: newAttempts,
					lockedAt: null,
					lockedBy: null,
					scheduledAt,
				})
				.where(eq(workflowQueue.id, jobId));

			logger.warn(
				{ jobId, workflowStateId: currentJob.workflowStateId, attempts: newAttempts, scheduledAt, error },
				"Workflow job failed, retrying",
			);
		}
	}

	/**
	 * Release stale locks (jobs locked for more than 5 minutes)
	 */
	static async releaseStaleLocks(): Promise<number> {
		const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

		const result = await db
			.update(workflowQueue)
			.set({
				status: "pending",
				lockedAt: null,
				lockedBy: null,
			})
			.where(and(eq(workflowQueue.status, "locked"), lte(workflowQueue.lockedAt, fiveMinutesAgo)));

		// Drizzle ORM with postgres returns an array-like result
		// We can't directly get rowCount, so we'll return 0 for now
		// The update operation itself indicates success
		logger.info("Released stale workflow locks");

		return 0;
	}
}

