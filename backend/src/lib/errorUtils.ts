import type { Context } from "hono";

/**
 * Determines if a request should receive JSON responses based on:
 * 1. Request path (API endpoints)
 * 2. Accept header preference
 */
export function shouldReturnJson(c: Context): boolean {
	const path = c.req.path;
	const acceptHeader = c.req.header("Accept") || "";

	// Always return JSON for API routes
	if (path.startsWith("/api/") || path.startsWith("/vantage/")) {
		return true;
	}

	// Return JSON if client explicitly accepts JSON
	if (acceptHeader.includes("application/json")) {
		return true;
	}

	return false;
}

/**
 * Creates a standardized JSON error response
 */
export function createJsonErrorResponse(message: string, status: number = 500) {
	return {
		error: message,
		status,
	};
}
