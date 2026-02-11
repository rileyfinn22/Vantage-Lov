// Load environment variables from .env file
// dotenv will look for .env in the current working directory (backend/)
import { config } from "dotenv";
config();

// IMPORTANT: This import must be first to initialize Sentry and OpenTelemetry tracing
import { Sentry } from "./instrumentation";

import { serve } from "@hono/node-server";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import app from ".";
import { cwd } from "node:process";
import { logger } from "#/lib/logger";
import { lookForUnratedInteractions } from "./vantage/slopAsker";
import { lookForUnprocessedFiles } from "./vantage/transcriptProcessor";
import { SERVER, TIMING, FEATURES } from "./config";
import { startWorkflowWorker, stopWorkflowWorker } from "./workers/workflow-worker";

// Shutdown tracking
let isShuttingDown = false;
let transcriptJobTimer: NodeJS.Timeout | null = null;
let ratingJobTimer: NodeJS.Timeout | null = null;
let serverStartTimer: NodeJS.Timeout | null = null;

const port = process.env.PORT ? Number(process.env.PORT) : SERVER.DEFAULT_PORT;
logger.info({ port, cwd: cwd() }, "Server configuration");

logger.debug({ pems: readdirSync("..").filter((f) => f.endsWith(".pem")) }, "Certificate files found");

const keyPath = "../localhost-key.pem";

const useHttps = existsSync(keyPath);
const options = useHttps
	? {
			serverOptions: {
				cert: readFileSync(keyPath.replace("-key", "")),
				key: readFileSync(keyPath),
			},
			createServer: createHttpsServer,
		}
	: {
			createServer: createHttpServer,
		};

if (useHttps) {
	logger.info("Using HTTPS");
} else {
	logger.info("Using HTTP");
}

const server = serve({
	port,
	hostname: "0.0.0.0",
	fetch: app.fetch,
	...options,
});

// Graceful shutdown handler
async function shutdown(signal: NodeJS.Signals) {
	if (isShuttingDown) return; // Prevent multiple shutdown attempts

	logger.info({ signal }, "Shutdown signal received");
	isShuttingDown = true;

	stopBackgroundJobs();

	// Flush Sentry events before shutdown
	try {
		await Sentry.close(2000);
		logger.info("Sentry flushed successfully");
	} catch (err) {
		logger.error({ err }, "Error flushing Sentry");
	}

	server.close((err) => {
		if (err) {
			logger.error({ err }, "Error during server shutdown");
			process.exit(1);
		}
		logger.info("Server closed successfully");
		process.exit(0);
	});

	// Force exit after timeout if graceful shutdown fails
	// Using unref() so this doesn't keep the event loop alive
	setTimeout(() => {
		logger.error("Forced shutdown after timeout");
		process.exit(2);
	}, TIMING.BACKGROUND_JOB_STARTUP_DELAY_MS).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Stop all background jobs and clear timers
function stopBackgroundJobs() {
	logger.info("Stopping background jobs");
	isShuttingDown = true;

	if (transcriptJobTimer) clearTimeout(transcriptJobTimer);
	if (ratingJobTimer) clearTimeout(ratingJobTimer);
	if (serverStartTimer) clearTimeout(serverStartTimer);

	// Stop workflow worker if async sessions are enabled
	if (FEATURES.ASYNC_SESSION_START) {
		stopWorkflowWorker();
	}
}

// Centralized background job scheduler
function startBackgroundJobs() {
	if (process.env.START_LOOK_JOBS === "false") {
		logger.info("Background jobs disabled (START_LOOK_JOBS=false)");
		return;
	}

	logger.info("Starting background jobs");

	// Transcript processing job
	const transcriptJobLoop = () => {
		if (isShuttingDown) return; // Don't reschedule if shutting down

		lookForUnprocessedFiles()
			.catch((error) => {
				logger.error({ error }, "Error in transcript processing job");
				Sentry.captureException(error);
			})
			.finally(() => {
				if (!isShuttingDown) {
					transcriptJobTimer = setTimeout(transcriptJobLoop, TIMING.TRANSCRIPT_JOB_INTERVAL_MS);
				}
			});
	};
	transcriptJobTimer = setTimeout(transcriptJobLoop, TIMING.INITIAL_JOB_DELAY_MS);

	// Rating and flagging job
	const ratingJobLoop = () => {
		if (isShuttingDown) return; // Don't reschedule if shutting down

		lookForUnratedInteractions()
			.catch((error) => {
				logger.error({ error }, "Error in rating/flagging job");
				Sentry.captureException(error);
			})
			.finally(() => {
				if (!isShuttingDown) {
					ratingJobTimer = setTimeout(ratingJobLoop, TIMING.RATING_JOB_INTERVAL_MS);
				}
			});
	};
	ratingJobTimer = setTimeout(ratingJobLoop, TIMING.INITIAL_JOB_DELAY_MS);

	// Workflow worker (for async session start)
	if (FEATURES.ASYNC_SESSION_START) {
		logger.info("Starting workflow worker for async session start");
		startWorkflowWorker();
	}
}

serverStartTimer = setTimeout(() => {
	logger.info({ address: server.address() }, "Server is running");
	startBackgroundJobs();
}, 100);
