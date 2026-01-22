import type { Context, MiddlewareHandler, Next } from "hono";
import type { AuthVariable } from "#/lib/types";
import { auth } from "#/lib/auth";

/**
 * Middleware that requires a user to be authenticated.
 * Returns 401 if user is not logged in.
 */
export const requireAuth = async (c: Context<AuthVariable<false>>, next: Next) => {
	const currentUser = c.get("user");
	if (!currentUser) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
};

export const authMiddleware: MiddlewareHandler<AuthVariable<true>> = async (c, next) => {
	try {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });

		if (!session) {
			c.set("user", null);
			c.set("session", null);
			return next();
		}

		c.set("user", session.user);
		c.set("session", session.session);
	} catch (_error) {
		c.set("user", null);
		c.set("session", null);
	}
	const res = await next();

	return res;
};
