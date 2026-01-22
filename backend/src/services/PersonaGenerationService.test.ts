import { describe, it, expect, beforeAll } from "vitest";
import { PersonaGenerationService } from "./PersonaGenerationService";
import { db } from "#/data";
import { salespeople, trainingScenarios, companies } from "#/data/schema";
import { eq } from "drizzle-orm";

describe("PersonaGenerationService", () => {
	let testSalespersonId: number;
	let testScenarioId: number;

	beforeAll(async () => {
		// Create a test company
		const [company] = await db
			.insert(companies)
			.values({
				name: "Test Company",
			})
			.returning();

		// Create a test salesperson
		const [salesperson] = await db
			.insert(salespeople)
			.values({
				firstName: "Test",
				lastName: "User",
				companyId: company.id,
			})
			.returning();

		testSalespersonId = salesperson.id;

		// Create a test scenario
		const [scenario] = await db
			.insert(trainingScenarios)
			.values({
				skillKey: "objection_handling",
				scenarioId: "test_scenario_1",
				title: "Test Budget Objection",
				difficulty: "Intermediate",
				duration: "15 min",
				participants: 2,
				context: "Client has budget concerns",
				scenario: "Test scenario description",
				objectives: ["Test objective 1"],
				commonObjections: ["Budget too high"],
				idealOutcome: "Client understands value",
				aiPrompt: "You are a test prospect",
				prospectData: {
					name: "Test Prospect",
					company: "Test Corp",
					role: "VP Operations",
					personality: "Analytical",
				},
			})
			.returning();

		testScenarioId = scenario.id;
	});

	describe("analyzeTranscriptPatterns", () => {
		it("should return transcript patterns for a salesperson", async () => {
			const patterns = await PersonaGenerationService.analyzeTranscriptPatterns(testSalespersonId, "objection_handling");

			expect(patterns).toBeDefined();
			expect(patterns.commonProspectTypes).toBeInstanceOf(Array);
			expect(patterns.commonLanguagePatterns).toBeInstanceOf(Array);
			expect(patterns.skillSpecificSituations).toBeInstanceOf(Array);
			expect(patterns.commonBreakdowns).toBeInstanceOf(Array);
		});

		it("should return generic patterns when no transcripts exist", async () => {
			// Use a non-existent salesperson ID
			const patterns = await PersonaGenerationService.analyzeTranscriptPatterns(99999, "discovery");

			expect(patterns).toBeDefined();
			expect(patterns.commonProspectTypes.length).toBeGreaterThan(0);
		});
	});

	describe("getSkillGapAnalysis", () => {
		it("should return skill gap analysis for a salesperson", async () => {
			const analysis = await PersonaGenerationService.getSkillGapAnalysis(testSalespersonId, "objection_handling");

			expect(analysis).toBeDefined();
			expect(analysis.skillKey).toBe("objection_handling");
			expect(analysis.currentRating).toBeGreaterThanOrEqual(0);
			expect(analysis.currentRating).toBeLessThanOrEqual(10);
			expect(analysis.targetRating).toBeGreaterThanOrEqual(analysis.currentRating);
			expect(analysis.gapsDescription).toBeDefined();
		});

		it("should handle invalid skill keys gracefully", async () => {
			const analysis = await PersonaGenerationService.getSkillGapAnalysis(testSalespersonId, "invalid_skill");

			expect(analysis).toBeDefined();
			expect(analysis.skillKey).toBe("discovery"); // Should default to discovery
		});
	});

	describe("generatePersonaPrompt", () => {
		it("should generate complete persona prompt data", async () => {
			const personaData = await PersonaGenerationService.generatePersonaPrompt(testScenarioId, testSalespersonId);

			expect(personaData).toBeDefined();
			expect(personaData.prompt).toBeDefined();
			expect(personaData.prompt.length).toBeGreaterThan(100);
			expect(personaData.firstMessage).toBeDefined();
			expect(personaData.scenario).toBeDefined();
			expect(personaData.skillData).toBeDefined();

			// Verify prompt contains key sections from the skills training prompt
			expect(personaData.prompt).toContain("THE FACTS OF YOUR SITUATION");
			expect(personaData.prompt).toContain("WHO YOU ARE PSYCHOLOGICALLY");
			expect(personaData.prompt).toContain("This Conversation Is Practicing");

			// Verify skill data is properly populated
			expect(personaData.skillData.currentRating).toBeGreaterThanOrEqual(0);
			expect(personaData.skillData.targetRating).toBeGreaterThan(0);
		});

		it("should throw error for non-existent scenario", async () => {
			await expect(PersonaGenerationService.generatePersonaPrompt(99999, testSalespersonId)).rejects.toThrow(
				"Training scenario 99999 not found",
			);
		});

		it("should throw error for non-existent salesperson", async () => {
			await expect(PersonaGenerationService.generatePersonaPrompt(testScenarioId, 99999)).rejects.toThrow("Salesperson 99999 not found");
		});
	});

	describe("generateElevenLabsConfig", () => {
		it("should generate valid ElevenLabs configuration", async () => {
			const config = await PersonaGenerationService.generateElevenLabsConfig(testScenarioId, testSalespersonId);

			expect(config).toBeDefined();
			expect(config.prompt).toBeDefined();
			expect(config.first_message).toBeDefined();
			expect(config.language).toBe("en");
			expect(config.model).toBe("eleven_turbo_v2_5");
			expect(config.voice_id).toBeDefined();
			expect(config.conversation_config).toBeDefined();
			expect(config.conversation_config.max_duration_seconds).toBe(600);
		});
	});
});
