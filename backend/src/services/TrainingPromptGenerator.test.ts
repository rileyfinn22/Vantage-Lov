import { describe, expect, it } from "vitest";
import { TrainingPromptGenerator } from "./TrainingPromptGenerator";

describe("TrainingPromptGenerator", () => {
	const mockFlagDetails = {
		flag: {
			id: 1,
			reason: "objection handling",
			source: "ollama" as const,
			complete: false,
			agentId: null,
			agentPrompt: null,
			repRating: null,
			managerReview: null,
			badFlagReport: null,
			weeklyReviewStatus: null,
			trainingSession: null,
			createdAt: new Date(),
			interactionId: 1,
			associatedSalespersonId: 1,
			flagData: {
				revision: "v1" as const,
				flag_title: "Struggled with Price Objection",
				confidenceOutOf100: 85,
				validation_checklist: [
					"Acknowledges customer's budget concerns",
					"Reframes price as investment",
					"Provides specific ROI examples",
					"Offers payment flexibility options",
				],
				what_happened:
					"Customer expressed concern about pricing being 30% higher than competitor. Rep immediately offered a discount instead of exploring value.",
				revenue_impact: "Lost opportunity worth $50K ARR. Top performers convert 65% of price objections by reframing value.",
				better_response:
					"First acknowledge the concern, then ask discovery questions about their comparison criteria and desired outcomes before discussing price.",
				benchmarking_context:
					"Top 20% of reps handle price objections with a 3-step framework: acknowledge, explore value drivers, reframe.",
				pattern_analysis: "Rep tends to offer discounts prematurely when facing price resistance (3/5 recent calls).",
				role_expectation: "AEs should confidently navigate pricing discussions without immediately resorting to discounts.",
				why_this_matters: "Premature discounting erodes margins and trains customers to always ask for discounts.",
				timestamps: { start: "2:15", end: "3:45" },
			},
		},
		interactionFlags: [],
		interaction: {
			id: 1,
			blurb: "Price objection discussion",
			processedStatus: "processed" as const,
			processedAt: new Date(),
			notes: null,
			rawInteractionText:
				"speaker_1: So I'm comparing your solution to a couple of competitors and I have to say, your pricing is coming in about 30% higher.\nspeaker_0: Oh yeah, um, well I can definitely work with you on that. Let me see what kind of discount I can get approved.",
			v1_raw_google_diarized: {
				segments: [
					{
						text: "So I'm comparing your solution to a couple of competitors and I have to say, your pricing is coming in about 30% higher.",
						speakerId: "speaker_1",
						startTime: 135.0,
						endTime: 142.5,
						confidence: 0.95,
					},
					{
						text: "Oh yeah, um, well I can definitely work with you on that. Let me see what kind of discount I can get approved.",
						speakerId: "speaker_0",
						startTime: 143.0,
						endTime: 148.2,
						confidence: 0.93,
					},
				],
				durationSeconds: 420,
				speakerCount: 2,
				processingTimeMs: 1500,
				service: "elevenlabs-scribe-v1",
			},
			metadata: null,
			createdAt: new Date(),
			salespersonId: 1,
		},
		salesperson: {
			salesperson: {
				id: 1,
				firstName: "John",
				lastName: "Smith",
				avatar: null,
				createdAt: new Date(),
				companyId: 1,
				associatedUserId: "user-123",
			},
			company: {
				id: 1,
				name: "Acme Corp",
				createdAt: new Date(),
				revenueGoal: "100000",
			},
			avgScore: 0,
			interactions: [],
			flags: [],
			revenue: [],
			revenueMetrics: {
				mtdClosed: 50000,
				qtdClosed: 120000,
				monthlyQuota: 100000,
				quarterlyQuota: 300000,
			},
		},
		audioFile: {
			id: 1,
			fileName: "call-audio.mp3",
			filePath: "uploads/interactions/1/call-audio.mp3",
			fileSize: 1024000,
			mimeType: "audio/mpeg",
			uploadedAt: new Date(),
			createdAt: new Date(),
			interactionId: 1,
			extractedAudioFileId: null,
			videoMetadata: null,
		},
	};

	describe("generate", () => {
		it("should generate system prompt with all available fields", () => {
			const result = TrainingPromptGenerator.generate(mockFlagDetails);

			// Verify system prompt includes new fields
			expect(result.systemPrompt).toContain("John Smith"); // Salesperson name
			expect(result.systemPrompt).toContain("Struggled with Price Objection"); // flag_title
			expect(result.systemPrompt).toContain("Lost opportunity worth $50K ARR"); // revenue_impact
			expect(result.systemPrompt).toContain("Top 20% of reps handle price objections"); // benchmarking_context
			expect(result.systemPrompt).toContain("Rep tends to offer discounts prematurely"); // pattern_analysis
			expect(result.systemPrompt).toContain("Acknowledges customer's budget concerns"); // validation_checklist
			expect(result.systemPrompt).toContain("Confidence Level: 85%"); // confidenceOutOf100

			// Verify it still includes legacy fields
			expect(result.systemPrompt).toContain("objection handling"); // reason
			expect(result.systemPrompt).toContain("Customer expressed concern about pricing"); // what_happened
			expect(result.systemPrompt).toContain("First acknowledge the concern"); // better_response
		});

		it("should include transcript excerpt when timestamps are available", () => {
			const result = TrainingPromptGenerator.generate(mockFlagDetails);

			// Should extract the relevant portion of transcript around the flag
			expect(result.systemPrompt).toContain("Relevant Excerpt from Original Call");
			expect(result.systemPrompt).toContain("pricing is coming in about 30% higher");
			expect(result.systemPrompt).toContain("work with you on that");
		});

		it("should generate simple first message", () => {
			const result = TrainingPromptGenerator.generate(mockFlagDetails);

			// Should generate a simple greeting (mimicking answering a phone)
			expect(result.firstMessage.toLowerCase()).toContain("hello");
		});

		it("should handle missing optional fields gracefully", () => {
			const minimalFlagDetails = {
				...mockFlagDetails,
				flag: {
					...mockFlagDetails.flag,
					flagData: {
						revision: "v1" as const,
						flag_title: "Sales Practice",
						confidenceOutOf100: 70,
						validation_checklist: [],
						what_happened: "A conversation occurred",
						revenue_impact: "Impact on revenue",
						better_response: "Better approach",
						benchmarking_context: "Benchmark info",
						role_expectation: "Role expectation",
						why_this_matters: "Why it matters",
						timestamps: {},
					},
				},
				interactionFlags: [],
				interaction: null,
				audioFile: null,
			};

			const result = TrainingPromptGenerator.generate(minimalFlagDetails);

			// Should still generate a valid prompt
			expect(result.systemPrompt).toBeTruthy();
			expect(result.systemPrompt.length).toBeGreaterThan(100);
			expect(result.firstMessage).toBeTruthy();
		});

		it("should adjust difficulty guidance based on confidence score", () => {
			// High confidence flag (85%)
			const highConfidenceResult = TrainingPromptGenerator.generate(mockFlagDetails);
			expect(highConfidenceResult.systemPrompt).toContain("critical skill gap");

			// Medium confidence flag
			const mediumConfidenceDetails = {
				...mockFlagDetails,
				flag: {
					...mockFlagDetails.flag,
					flagData: {
						...mockFlagDetails.flag.flagData,
						confidenceOutOf100: 65,
					},
				},
			};
			const mediumConfidenceResult = TrainingPromptGenerator.generate(mediumConfidenceDetails);
			expect(mediumConfidenceResult.systemPrompt).toContain("notable improvement area");

			// Low confidence flag
			const lowConfidenceDetails = {
				...mockFlagDetails,
				flag: {
					...mockFlagDetails.flag,
					flagData: {
						...mockFlagDetails.flag.flagData,
						confidenceOutOf100: 45,
					},
				},
			};
			const lowConfidenceResult = TrainingPromptGenerator.generate(lowConfidenceDetails);
			expect(lowConfidenceResult.systemPrompt).toContain("potential development area");
		});

		it("should include validation checklist in success criteria", () => {
			const result = TrainingPromptGenerator.generate(mockFlagDetails);

			expect(result.systemPrompt).toContain("Success Criteria");
			expect(result.systemPrompt).toContain("Acknowledges customer's budget concerns");
			expect(result.systemPrompt).toContain("Reframes price as investment");
			expect(result.systemPrompt).toContain("Provides specific ROI examples");
		});

		it("should handle missing salesperson name gracefully", () => {
			const noNameDetails = {
				...mockFlagDetails,
				salesperson: {
					...mockFlagDetails.salesperson,
					salesperson: {
						...mockFlagDetails.salesperson.salesperson,
						firstName: "",
						lastName: "",
					},
				},
			};

			const result = TrainingPromptGenerator.generate(noNameDetails);

			// Should still generate a valid first message
			expect(result.firstMessage.toLowerCase()).toContain("hello");
			expect(result.systemPrompt).toBeTruthy();
		});
	});
});
