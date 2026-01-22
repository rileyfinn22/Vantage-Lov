import { trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import type { AuthVariable } from "#/lib/types";
import { routePath, baseRoutePath } from "hono/route";

/**
 * Simple middleware that enhances auto-instrumented HTTP spans with custom attributes.
 * Does not create new spans - just adds metadata to existing ones.
 */
export const tracingMiddleware: MiddlewareHandler<AuthVariable> = async (c, next) => {
	// Get the span that was already created by auto-instrumentation
	const span = trace.getActiveSpan();

	if (span) {
		// Add custom attributes to help identify the route
		span.setAttribute("http.hono.route", routePath(c));
		span.setAttribute("http.hono.base", baseRoutePath(c));
		span.setAttribute("app.handler", "hono");

		// Add tenant identifier if available
		if (process.env.TENANT_NAME) {
			span.setAttribute("app.tenant", process.env.TENANT_NAME);
		}

		// Store span in context so route handlers can create subspans if needed
		c.set("span", span);
	}

	await next();

	// Add status code after response is ready
	if (span) {
		span.setAttribute("http.status_code", c.res.status);
	}
};
