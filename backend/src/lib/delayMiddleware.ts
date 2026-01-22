import type { MiddlewareHandler } from "hono";

export const createDelayMiddleware = (multiplier: number): MiddlewareHandler => {
	return async (c, next) => {
		const path = c.req.path;
		let baseDelay = 0;

		if (path === "/health") {
			baseDelay = 0;
		} else if (path.startsWith("/assets/")) {
			baseDelay = 10;
		} else if (path.startsWith("/api/auth/")) {
			baseDelay = 50;
		} else if (path.startsWith("/api/") || path.startsWith("/vantage/")) {
			baseDelay = 100;
		}

		const delay = baseDelay * multiplier;

		if (delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		await next();
	};
};
