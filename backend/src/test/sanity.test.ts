import { describe, it, expect } from "vitest";
import app from "#/index";

describe("Sanity Tests", () => {
	it("should call the health endpoint successfully", async () => {
		const req = new Request("http://localhost/vantage/health");
		const res = await app.request(req);

		expect(res.status).toBe(200);

		const data = await res.json();

		expect(data).toHaveProperty("status");
		expect(data).toHaveProperty("timestamp");
		expect(data).toHaveProperty("database");
		expect(data.database).toHaveProperty("connected");

		expect(data.status).toBe("ok");
		expect(data.database.connected).toBe(true);
	});

	it("should return proper timestamp format", async () => {
		const req = new Request("http://localhost/vantage/health");
		const res = await app.request(req);
		const data = await res.json();

		expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
	});
});
