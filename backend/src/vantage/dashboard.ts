import { db } from "#/data";
import { eq, count, sql, and, gte, lt } from "drizzle-orm";
import * as schema from "#/data/schema";

// Compute average rating from interaction ratings (Vantage Score)
const avgRatingSub = db
	.select({
		salesId: schema.interactions.salespersonId,
		avgScore: sql<number>`COALESCE(ROUND(AVG(${schema.ratings.value})), 0)`.as("avgScore"),
	})
	.from(schema.ratings)
	.innerJoin(schema.interactions, eq(schema.ratings.interactionId, schema.interactions.id))
	.groupBy(schema.interactions.salespersonId)
	.as("avgRatingQuery");

const flagSub = db
	.select({
		salesId: schema.flags.associatedSalespersonId,
		flags: count().as("flagCount"),
	})
	.from(schema.flags)
	.where(eq(schema.flags.complete, false))
	.groupBy(schema.flags.associatedSalespersonId)
	.as("flagQuery");

const revenueSub = db
	.select({
		salesId: schema.revenue.associatedSalespersonId,
		revenue: sql<number>`COALESCE(SUM(${schema.revenue.amount}), 0)`.as("revenue"),
	})
	.from(schema.revenue)
	.groupBy(schema.revenue.associatedSalespersonId)
	.as("revenueQuery");

// MTD Revenue subquery
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth();
const monthStart = new Date(currentYear, currentMonth, 1);
const monthEnd = new Date(currentYear, currentMonth + 1, 1);

const mtdRevenueSub = db
	.select({
		salesId: schema.revenue.associatedSalespersonId,
		mtdRevenue: sql<number>`COALESCE(SUM(${schema.revenue.amount}), 0)`.as("mtdRevenue"),
	})
	.from(schema.revenue)
	.where(and(gte(schema.revenue.closedAt, monthStart), lt(schema.revenue.closedAt, monthEnd)))
	.groupBy(schema.revenue.associatedSalespersonId)
	.as("mtdRevenueQuery");

// Battle card assignments subquery - count pending/in_progress battle_card assignments
const battleCardTasksSub = db
	.select({
		salesId: schema.trainingAssignments.salespersonId,
		battleCardTasks: count().as("battleCardTasks"),
	})
	.from(schema.trainingAssignments)
	.where(and(eq(schema.trainingAssignments.trainingType, "battle_card"), sql`${schema.trainingAssignments.status} != 'completed'`))
	.groupBy(schema.trainingAssignments.salespersonId)
	.as("battleCardTasksQuery");

// Skills assignments subquery - count pending/in_progress scenario assignments
const skillsTasksSub = db
	.select({
		salesId: schema.trainingAssignments.salespersonId,
		skillsTasks: count().as("skillsTasks"),
	})
	.from(schema.trainingAssignments)
	.where(and(eq(schema.trainingAssignments.trainingType, "scenario"), sql`${schema.trainingAssignments.status} != 'completed'`))
	.groupBy(schema.trainingAssignments.salespersonId)
	.as("skillsTasksQuery");

export async function dashboardData(userId: string) {
	const me = await db
		.select({ cid: schema.salespeople.companyId })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId));

	// If user is not a salesperson, check for company roles
	if (me.length === 0 || !me[0]?.cid) {
		const companyRole = await db
			.select({ companyId: schema.companyUserRoles.companyId })
			.from(schema.companyUserRoles)
			.where(eq(schema.companyUserRoles.userId, userId))
			.limit(1);

		if (companyRole.length === 0 || !companyRole[0]?.companyId) {
			// User has no company association, return empty data
			return [];
		}

		// User has company role, fetch data for that company
		const otherAndRatings = await db
			.select()
			.from(schema.salespeople)
			.where(eq(schema.salespeople.companyId, companyRole[0].companyId))
			.leftJoin(avgRatingSub, eq(avgRatingSub.salesId, schema.salespeople.id))
			.leftJoin(flagSub, eq(flagSub.salesId, schema.salespeople.id))
			.leftJoin(revenueSub, eq(revenueSub.salesId, schema.salespeople.id))
			.leftJoin(mtdRevenueSub, eq(mtdRevenueSub.salesId, schema.salespeople.id))
			.leftJoin(battleCardTasksSub, eq(battleCardTasksSub.salesId, schema.salespeople.id))
			.leftJoin(skillsTasksSub, eq(skillsTasksSub.salesId, schema.salespeople.id));

		const salespeopleWithRatings = otherAndRatings.map((salesperson) => {
			return {
				...salesperson.salespeople,
				flags: salesperson.flagQuery?.flags ?? 0,
				score: salesperson.avgRatingQuery?.avgScore ?? 0,
				revenue: salesperson.revenueQuery?.revenue ?? 0,
				mtdRevenue: salesperson.mtdRevenueQuery?.mtdRevenue ?? 0,
				battleCardTasks: salesperson.battleCardTasksQuery?.battleCardTasks ?? 0,
				skillsTasks: salesperson.skillsTasksQuery?.skillsTasks ?? 0,
			};
		});

		return salespeopleWithRatings;
	}

	const otherAndRatings = await db
		.select()
		.from(schema.salespeople)
		.where(eq(schema.salespeople.companyId, me[0].cid))
		.leftJoin(avgRatingSub, eq(avgRatingSub.salesId, schema.salespeople.id))
		.leftJoin(flagSub, eq(flagSub.salesId, schema.salespeople.id))
		.leftJoin(revenueSub, eq(revenueSub.salesId, schema.salespeople.id))
		.leftJoin(mtdRevenueSub, eq(mtdRevenueSub.salesId, schema.salespeople.id))
		.leftJoin(battleCardTasksSub, eq(battleCardTasksSub.salesId, schema.salespeople.id))
		.leftJoin(skillsTasksSub, eq(skillsTasksSub.salesId, schema.salespeople.id));

	const salespeopleWithRatings = otherAndRatings.map((salesperson) => {
		return {
			...salesperson.salespeople,
			flags: salesperson.flagQuery?.flags ?? 0,
			score: salesperson.avgRatingQuery?.avgScore ?? 0,
			revenue: salesperson.revenueQuery?.revenue ?? 0,
			mtdRevenue: salesperson.mtdRevenueQuery?.mtdRevenue ?? 0,
			battleCardTasks: salesperson.battleCardTasksQuery?.battleCardTasks ?? 0,
			skillsTasks: salesperson.skillsTasksQuery?.skillsTasks ?? 0,
		};
	});

	return salespeopleWithRatings;
}

export async function dashboardRevenueData(_userId: string) {
	// TODO AW: Implement revenue fetching logic
}
