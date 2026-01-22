// Dashboard data tests

import { describe, test, expect } from "vitest";
import app from "#/index";
import { loginAndGetCookie } from "#/lib/testUtils";

describe("Dashboard data", () => {
	test("Salesperson (Angela) appears on their own dashboard", async () => {
		const email = "angela@v.alexw.codes";
		const password = "brazil-tree-fire";
		const cookie = await loginAndGetCookie(email, password);

		const reponse = await app.request("/vantage/api/page/dashboard", {
			headers: {
				cookie,
			},
		});

		expect(reponse.status).toBe(200);
		const data = await reponse.json();
		expect(data.leaderboard).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					firstName: "Angela",
				}),
			]),
		);
	});

	test("Salesperson (Bob) appears on their own dashboard", async () => {
		const email = "bob@v.alexw.codes";
		const password = "brazil-tree-fire";
		const cookie = await loginAndGetCookie(email, password);

		// Now you can use the cookie to make authenticated requests
		const response = await app.request("/vantage/api/page/dashboard", {
			headers: {
				cookie,
			},
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.leaderboard).toBeDefined();
		expect(data.leaderboard.length).toBeGreaterThan(0);

		////
		// Bobby should see Bobby and Lee, but not Angela
		////
		expect(data.leaderboard).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					firstName: "Bobby",
				}),
				expect.objectContaining({
					firstName: "Lee",
				}),
			]),
		);

		expect(data.leaderboard).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					firstName: "Angela",
				}),
			]),
		);
	});

	test("When not signed in, unauthorized", async () => {
		const response = await app.request("/vantage/api/page/dashboard");

		expect(response.status).toBe(401);
		const text = await response.json();
		expect(text.error).toBe("Unauthorized");
	});
});
