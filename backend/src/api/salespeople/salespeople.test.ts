import { describe, test, beforeAll, expect } from "vitest";
import { db, users, usersReady } from "#/data";
import app from "#/index";
import * as schema from "#/data/schema";
import { loginAndGetCookie } from "#/lib/testUtils";

describe("salespeople API", () => {
	let bobbySalespersonId: number;

	beforeAll(async () => {
		// Wait for database seeding to complete
		await usersReady;
		if (!users) throw new Error("Database not seeded");

		// Get salesperson IDs from the database
		const salespeople = await db.select().from(schema.salespeople);
		bobbySalespersonId = salespeople.find((sp) => sp.firstName === "Bobby")?.id!;
	});

	test("Loading up Bobby as Bob returns his data", async () => {
		const email = "bob@v.alexw.codes";
		const password = "brazil-tree-fire";
		const cookie = await loginAndGetCookie(email, password);

		const response = await app.request(`/vantage/api/salespeople/${bobbySalespersonId}`, {
			headers: {
				cookie,
			},
		});

		expect(response.status).toBe(200);
		const data = await response.json();

		// Verify salesperson data
		expect(data.salesperson).toBeDefined();
		expect(data.salesperson.firstName).toBe("Bobby");
		expect(data.salesperson.associatedUserId).toBe(users?.bob.id);

		// Verify company data
		expect(data.company).toBeDefined();
	});

	test("Unauthenticated request returns unauthorized", async () => {
		const response = await app.request(`/vantage/api/salespeople/${bobbySalespersonId}`);

		expect(response.status).toBe(401);
		const data = await response.json();
		expect(data.error).toBe("Unauthorized");
	});

	test("Non-existent salesperson ID returns not found", async () => {
		const email = "bob@v.alexw.codes";
		const password = "brazil-tree-fire";
		const cookie = await loginAndGetCookie(email, password);

		const response = await app.request("/vantage/api/salespeople/99999", {
			headers: {
				cookie,
			},
		});

		expect(response.status).toBe(404);
		const data = await response.json();
		expect(data.error).toBe("Salesperson not found");
	});
});
