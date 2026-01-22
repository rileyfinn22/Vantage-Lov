import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { requireAuth } from "#/middleware/auth";
import { dashboardData } from "#/vantage/dashboard";

const app = new Hono<AuthVariable<false>>().get("/", requireAuth, async (c) => {
	const salespeopleWithRatings = await dashboardData(c.get("user").id);
	return c.json({
		leaderboard: salespeopleWithRatings,
		// TODO AH: Replace with actual star salesperson
		star: salespeopleWithRatings?.[0],
	});
});

export default app;
