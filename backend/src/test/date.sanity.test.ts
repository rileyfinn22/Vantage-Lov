import { describe, expect, test } from "vitest";

describe("Do I understand javascript dates?", () => {
	test("Going back one month in january puts you in december of the year prior", () => {
		const jan = new Date(2024, 0, 1);
		jan.setMonth(jan.getMonth() - 1);
		expect(jan.getMonth()).toBe(11);
		expect(jan.getFullYear()).toBe(2023);
	});

	test("Going back 13 months in january puts you in december of two years prior", () => {
		const jan = new Date(2024, 0, 1);
		jan.setMonth(jan.getMonth() - 13);
		expect(jan.getMonth()).toBe(11);
		expect(jan.getFullYear()).toBe(2022);
	});

	const dayBench = new Date(2024, 0, 3);
	test.for([
		{ offset: -1, expected: new Date(2024, 0, 2) },
		{ offset: -2, expected: new Date(2024, 0, 1) },
		{ offset: -3, expected: new Date(2023, 11, 31) },
		{ offset: -35, expected: new Date(2023, 10, 29) },
	])("Setting by %i date puts you in %s", ({ offset, expected }) => {
		const d = new Date(dayBench);
		d.setDate(d.getDate() + offset);
		expect(d.getDate()).toBe(expected.getDate());
		expect(d.getMonth()).toBe(expected.getMonth());
		expect(d.getFullYear()).toBe(expected.getFullYear());
	});
});
