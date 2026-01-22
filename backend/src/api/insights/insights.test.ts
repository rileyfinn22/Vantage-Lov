import { describe, test, expect } from "vitest";
import app from "#/index";
import { loginAndGetCookie } from "#/lib/testUtils";

describe("insights API", () => {
	test("Should deny access without authentication", async () => {
		const response = await app.request("/vantage/api/insights");

		expect(response.status).toBe(401);
		const data = await response.json();
		expect(data.error).toBe("Unauthorized");
	});

	test("Bob gets insights data for his company (Bob's Widgets)", async () => {
		const email = "bob@v.alexw.codes";
		const password = "brazil-tree-fire";
		const cookie = await loginAndGetCookie(email, password);

		const response = await app.request("/vantage/api/insights", {
			headers: {
				cookie,
			},
		});

		expect(response.status).toBe(200);
		const data = await response.json();

		// Verify response structure
		expect(data).toHaveProperty("notifications");
		expect(data).toHaveProperty("objections");
		expect(data).toHaveProperty("prospectPainPoints");
		expect(data).toHaveProperty("repPainPoints");

		// Verify notifications are present for Bob
		expect(Array.isArray(data.notifications)).toBe(true);
		expect(data.notifications.length).toBeGreaterThan(0);

		// Verify objections are present for Bob's company
		expect(Array.isArray(data.objections)).toBe(true);
		expect(data.objections.length).toBeGreaterThan(0);

		// Verify at least one objection matches our seed data for Bob's Widgets
		const budgetObjection = data.objections.find((obj: any) => obj.title === "Budget constraints");
		expect(budgetObjection).toBeDefined();
		expect(budgetObjection).toMatchObject({
			title: "Budget constraints",
			description: "Prospects citing limited budget or need for approval",
			frequency: 45,
			trend: "up",
			phase: "close",
			impact: "high",
		});

		// Verify pain points are present
		expect(Array.isArray(data.prospectPainPoints)).toBe(true);
		expect(Array.isArray(data.repPainPoints)).toBe(true);
		expect(data.prospectPainPoints.length + data.repPainPoints.length).toBeGreaterThan(0);

		// Verify at least one prospect pain point matches our seed data
		const manualProcessesPain = data.prospectPainPoints.find((pain: any) => pain.title === "Inefficient manual processes");
		expect(manualProcessesPain).toBeDefined();
		expect(manualProcessesPain).toMatchObject({
			title: "Inefficient manual processes",
			description: "Prospects struggling with time-consuming manual workflows",
			frequency: 72,
			phase: "discovery",
			severity: "critical",
		});
	});

	test("Angela gets insights data for her company (Robert's Insurance), not Bob's", async () => {
		const email = "angela@v.alexw.codes";
		const password = "brazil-tree-fire";
		const cookie = await loginAndGetCookie(email, password);

		const response = await app.request("/vantage/api/insights", {
			headers: {
				cookie,
			},
		});

		expect(response.status).toBe(200);
		const data = await response.json();

		// Verify response structure
		expect(data).toHaveProperty("notifications");
		expect(data).toHaveProperty("objections");
		expect(data).toHaveProperty("prospectPainPoints");
		expect(data).toHaveProperty("repPainPoints");

		// Verify Angela gets her own notifications
		expect(Array.isArray(data.notifications)).toBe(true);

		// Verify Angela gets Robert's Insurance objections, NOT Bob's Widgets objections
		expect(Array.isArray(data.objections)).toBe(true);

		// Should NOT find Budget constraints (that's Bob's Widgets specific)
		const budgetObjection = data.objections.find((obj: any) => obj.title === "Budget constraints");
		expect(budgetObjection).toBeUndefined();

		// Should find insurance-specific objections
		if (data.objections.length > 0) {
			const insuranceObjection = data.objections.find(
				(obj: any) => obj.title === "Already have coverage" || obj.title === "Premium too expensive",
			);
			expect(insuranceObjection).toBeDefined();
		}

		// Verify pain points are for Robert's Insurance company
		expect(Array.isArray(data.prospectPainPoints)).toBe(true);
		expect(Array.isArray(data.repPainPoints)).toBe(true);

		// Should NOT find Bob's Widgets pain points
		const manualProcessesPain = data.prospectPainPoints.find((pain: any) => pain.title === "Inefficient manual processes");
		expect(manualProcessesPain).toBeUndefined();

		// Should find insurance-specific pain points if any exist
		if (data.prospectPainPoints.length > 0) {
			const insurancePain = data.prospectPainPoints.find((pain: any) => pain.title === "Complex policy comparisons");
			expect(insurancePain).toBeDefined();
		}
	});
});
