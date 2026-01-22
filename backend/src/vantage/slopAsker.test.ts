import { describe, test, beforeEach, expect } from "vitest";
import { db } from "#/data";
import { sql } from "drizzle-orm";
import { getPrompt } from "./slopAsker";
import { insertPromptSetting } from "./slopAsker.db";
import { trainingFlagPrompt, trainingSkillsPrompt } from "#/lib/prompt/v1";
// Import system instructions from centralized location
import { RATING_SYSTEM_INSTRUCTIONS, FLAGGING_SYSTEM_INSTRUCTIONS } from "#/lib/prompt/analysis-defaults";

describe("slopAsker", () => {
	beforeEach(async () => {
		await db.execute(sql`TRUNCATE system_prompt_settings RESTART IDENTITY CASCADE`);
	});

	describe("getPrompt", () => {
		test("falls back to built-in defaults when no prompts in database", async () => {
			const rating = await getPrompt("rating");
			const flagging = await getPrompt("flagging");
			const trainingFlag = await getPrompt("training_flag");
			const trainingScenario = await getPrompt("training_scenario");

			// Rating should fallback to RATING_SYSTEM_INSTRUCTIONS (actual agent prompt)
			expect(rating).toBe(RATING_SYSTEM_INSTRUCTIONS);
			// Flagging should fallback to FLAGGING_SYSTEM_INSTRUCTIONS (actual agent prompt)
			expect(flagging).toBe(FLAGGING_SYSTEM_INSTRUCTIONS);
			// Training flag should fallback to built-in trainingFlagPrompt()
			expect(trainingFlag).toBe(trainingFlagPrompt());
			// Training scenario should fallback to trainingSkillsPrompt (legacy redirect)
			expect(trainingScenario).toBe(trainingSkillsPrompt());
		});

		test("uses database value when available for rating", async () => {
			const ratingValue = "Custom rating prompt from DB";
			await insertPromptSetting("rating", ratingValue);

			const rating = await getPrompt("rating");
			const flagging = await getPrompt("flagging");

			expect(rating).toBe(ratingValue);
			// Flagging should still use built-in default
			expect(flagging).toBe(FLAGGING_SYSTEM_INSTRUCTIONS);
		});

		test("uses database value when available for flagging", async () => {
			const flaggingValue = "Custom flagging prompt from DB";
			await insertPromptSetting("flagging", flaggingValue);

			const rating = await getPrompt("rating");
			const flagging = await getPrompt("flagging");

			// Rating should still use built-in default
			expect(rating).toBe(RATING_SYSTEM_INSTRUCTIONS);
			expect(flagging).toBe(flaggingValue);
		});

		test("uses database value when available for training_flag", async () => {
			const trainingFlagValue = "Custom training_flag prompt from DB";
			await insertPromptSetting("training_flag", trainingFlagValue);

			const trainingFlag = await getPrompt("training_flag");

			expect(trainingFlag).toBe(trainingFlagValue);
		});

		test("uses database value when available for training_scenario", async () => {
			const trainingScenarioValue = "Custom training_scenario prompt from DB";
			await insertPromptSetting("training_scenario", trainingScenarioValue);

			const trainingScenario = await getPrompt("training_scenario");

			expect(trainingScenario).toBe(trainingScenarioValue);
		});

		test("handles JSONB string values correctly", async () => {
			const rawString = "HELLO";
			const jsonObject = { prompt: "HELLO" };

			await insertPromptSetting("rating", rawString);
			await insertPromptSetting("flagging", jsonObject);

			const ratingPrompt = await getPrompt("rating");
			const flaggingPrompt = await getPrompt("flagging");

			expect(ratingPrompt).toBe(rawString);
			expect(flaggingPrompt).toBe(JSON.stringify(jsonObject));
		});
	});

	describe("integration", () => {
		test("all prompts can be independently overridden", async () => {
			const ratingValue = "Rating from DB";
			const flaggingValue = "Flagging from DB";
			const trainingFlagValue = "Training Flag from DB";
			const trainingScenarioValue = "Training Scenario from DB";

			await insertPromptSetting("rating", ratingValue);
			await insertPromptSetting("flagging", flaggingValue);
			await insertPromptSetting("training_flag", trainingFlagValue);
			await insertPromptSetting("training_scenario", trainingScenarioValue);

			expect(await getPrompt("rating")).toBe(ratingValue);
			expect(await getPrompt("flagging")).toBe(flaggingValue);
			expect(await getPrompt("training_flag")).toBe(trainingFlagValue);
			expect(await getPrompt("training_scenario")).toBe(trainingScenarioValue);
		});

		test("database prompts override built-in defaults independently", async () => {
			const ratingValue = "Rating override";

			await insertPromptSetting("rating", ratingValue);

			expect(await getPrompt("rating")).toBe(ratingValue);
			// Others should still use built-in defaults
			expect(await getPrompt("flagging")).toBe(FLAGGING_SYSTEM_INSTRUCTIONS);
			expect(await getPrompt("training_flag")).toBe(trainingFlagPrompt());
			expect(await getPrompt("training_scenario")).toBe(trainingSkillsPrompt());
		});

		test("each prompt type is independent", async () => {
			const flaggingValue = "Flagging only";

			await insertPromptSetting("flagging", flaggingValue);

			// Flagging should use database value
			expect(await getPrompt("flagging")).toBe(flaggingValue);
			// Others should still use built-in defaults
			expect(await getPrompt("rating")).toBe(RATING_SYSTEM_INSTRUCTIONS);
			expect(await getPrompt("training_flag")).toBe(trainingFlagPrompt());
			expect(await getPrompt("training_scenario")).toBe(trainingSkillsPrompt());
		});

		test("partial database overrides work correctly", async () => {
			const ratingValue = "Rating only";
			const trainingScenarioValue = "Training Scenario only";

			await insertPromptSetting("rating", ratingValue);
			await insertPromptSetting("training_scenario", trainingScenarioValue);

			expect(await getPrompt("rating")).toBe(ratingValue);
			expect(await getPrompt("training_scenario")).toBe(trainingScenarioValue);
			// Others should still use built-in defaults
			expect(await getPrompt("flagging")).toBe(FLAGGING_SYSTEM_INSTRUCTIONS);
			// training_flag now has its own default template
			expect(await getPrompt("training_flag")).toBe(trainingFlagPrompt());
		});

		test("training prompts are independent from each other", async () => {
			const trainingFlagValue = "Flag-based training";
			const trainingScenarioValue = "Scenario-based training";

			await insertPromptSetting("training_flag", trainingFlagValue);
			await insertPromptSetting("training_scenario", trainingScenarioValue);

			expect(await getPrompt("training_flag")).toBe(trainingFlagValue);
			expect(await getPrompt("training_scenario")).toBe(trainingScenarioValue);
			// Analysis prompts should still use defaults
			expect(await getPrompt("rating")).toBe(RATING_SYSTEM_INSTRUCTIONS);
			expect(await getPrompt("flagging")).toBe(FLAGGING_SYSTEM_INSTRUCTIONS);
		});
	});
});
