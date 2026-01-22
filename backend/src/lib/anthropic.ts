/**
 * Shared Anthropic client singleton
 *
 * Provides a single Anthropic client instance for all services.
 * The SDK automatically reads ANTHROPIC_API_KEY from environment.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "#/lib/logger";
import { AI } from "#/config";

let anthropicClient: Anthropic | null = null;

/**
 * Get the shared Anthropic client instance.
 * Creates a new client on first call, reuses it thereafter.
 *
 * @throws Error if ANTHROPIC_API_KEY is not set
 */
export function getAnthropicClient(): Anthropic {
	if (!anthropicClient) {
		if (!process.env.ANTHROPIC_API_KEY) {
			throw new Error("ANTHROPIC_API_KEY environment variable is required");
		}
		anthropicClient = new Anthropic();
		logger.debug("Anthropic client initialized");
	}
	return anthropicClient;
}

/**
 * Check if Anthropic client can be initialized (API key is present)
 */
export function isAnthropicAvailable(): boolean {
	return !!process.env.ANTHROPIC_API_KEY;
}

// Default model to use across services (re-exported from config for convenience)
export const ANTHROPIC_MODEL = AI.DEFAULT_ANTHROPIC_MODEL;
