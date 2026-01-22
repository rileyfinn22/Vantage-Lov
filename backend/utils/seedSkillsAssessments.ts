import { db } from "../src/data/index.js";
import * as schema from "../src/data/schema.js";
import { eq, sql } from "drizzle-orm";

/**
 * Seed script to add sample skills assessment data
 * This populates the skills_assessments table with realistic data
 * for existing interactions that have ratings
 */

async function seedSkillsAssessments() {
	console.log("🌱 Seeding skills assessments...");

	// Get all interactions that have ratings but no skills assessments
	const interactionsWithRatings = await db
		.select({
			interactionId: schema.interactions.id,
			salespersonId: schema.interactions.salespersonId,
			rating: schema.ratings.value,
		})
		.from(schema.interactions)
		.innerJoin(schema.ratings, eq(schema.interactions.id, schema.ratings.interactionId))
		.leftJoin(schema.skillsAssessments, eq(schema.interactions.id, schema.skillsAssessments.interactionId))
		.where(sql`${schema.skillsAssessments.id} IS NULL`);

	if (interactionsWithRatings.length === 0) {
		console.log("✅ No interactions need skills assessments (already seeded or no interactions)");
		return;
	}

	console.log(`📊 Found ${interactionsWithRatings.length} interactions that need skills assessments`);

	for (const interaction of interactionsWithRatings) {
		// Generate realistic skill scores based on the overall rating
		// Higher overall rating = generally higher skill scores, with some variation
		const baseScore = Math.floor(interaction.rating / 10); // Convert 0-100 to 0-10
		const variation = () => Math.floor(Math.random() * 3) - 1; // -1, 0, or 1

		// Ensure scores stay in 1-10 range, with occasional N/A (0)
		const clampScore = (score: number): number => {
			if (Math.random() < 0.1) return 0; // 10% chance of N/A
			return Math.max(1, Math.min(10, score));
		};

		const objectionHandling = clampScore(baseScore + variation());
		const pricingDiscussions = clampScore(baseScore + variation());
		const discoveryFeatures = clampScore(baseScore + variation());
		const closing = clampScore(baseScore + variation());

		// Generate realistic assessment data
		const assessmentData = {
			skills: {
				objection_handling: {
					score: objectionHandling || ("N/A" as const),
					evidence:
						objectionHandling === 0
							? "No objections were raised during this call."
							: objectionHandling >= 8
								? "Rep expertly handled pricing concerns by reframing them as value discussions. Used the feel-felt-found framework effectively."
								: objectionHandling >= 6
									? "Rep acknowledged objections and provided counterpoints, though could have dug deeper into root concerns."
									: "Rep responded to objections defensively instead of exploring the underlying concerns.",
					missed_opportunity:
						objectionHandling > 0 && objectionHandling < 7
							? "Could have used the 'isolate and address' technique to ensure objection was fully resolved before moving forward."
							: null,
				},
				pricing_discussions: {
					score: pricingDiscussions || ("N/A" as const),
					evidence:
						pricingDiscussions === 0
							? "Pricing was not discussed in this call."
							: pricingDiscussions >= 8
								? "Strong value-based pricing discussion. Rep anchored ROI before presenting price and handled pushback with confidence."
								: pricingDiscussions >= 6
									? "Rep discussed price but could have built more value before revealing numbers."
									: "Rep offered discount too quickly without fully establishing value proposition.",
					missed_opportunity:
						pricingDiscussions > 0 && pricingDiscussions < 7
							? "Should have quantified ROI with specific numbers before discussing price to create stronger value anchor."
							: null,
				},
				discovery_needs_analysis: {
					score: discoveryFeatures || ("N/A" as const),
					evidence:
						discoveryFeatures === 0
							? "This was a closing call with no discovery phase."
							: discoveryFeatures >= 8
								? "Excellent discovery with layered questions. Uncovered pain points, budget, timeline, and decision-making process."
								: discoveryFeatures >= 6
									? "Solid discovery covering basic needs, though missed opportunities to explore business impact."
									: "Limited discovery - primarily presented features without understanding specific customer needs.",
					missed_opportunity:
						discoveryFeatures > 0 && discoveryFeatures < 7
							? "Could have asked more about quantifiable business impact and what success looks like in 6 months."
							: null,
				},
				closing_next_steps: {
					score: closing || ("N/A" as const),
					evidence:
						closing === 0
							? "This was an early discovery call not intended for closing."
							: closing >= 8
								? "Strong close with clear next steps. Rep secured specific meeting time and assigned action items with accountability."
								: closing >= 6
									? "Rep attempted to close and got verbal agreement on next steps, but didn't create enough urgency."
									: "Weak close - ended with vague 'let me know' instead of securing commitment.",
					missed_opportunity:
						closing > 0 && closing < 7 ? "Should have created urgency around implementation timeline or limited availability." : null,
				},
			},
			call_context: {
				inferred_call_type: ["discovery", "demo", "negotiation", "follow-up"][Math.floor(Math.random() * 4)] as
					| "discovery"
					| "demo"
					| "negotiation"
					| "closing"
					| "follow-up",
				call_stage: ["early", "mid", "late"][Math.floor(Math.random() * 3)] as "early" | "mid" | "late",
				primary_objective:
					interaction.rating >= 75
						? "Build rapport and understand customer needs while positioning value proposition"
						: interaction.rating >= 50
							? "Present solution and address concerns"
							: "Attempt to recover stalled deal",
			},
			red_flags: interaction.rating < 50 ? ["Talked over prospect multiple times", "Failed to confirm understanding"] : [],
			top_strength:
				objectionHandling >= Math.max(pricingDiscussions, discoveryFeatures, closing)
					? "Objection handling"
					: pricingDiscussions >= Math.max(discoveryFeatures, closing)
						? "Pricing discussions"
						: discoveryFeatures >= closing
							? "Discovery and needs analysis"
							: "Closing technique",
			priority_improvement:
				closing <= Math.min(objectionHandling, pricingDiscussions, discoveryFeatures)
					? "Closing confidence and securing commitment"
					: discoveryFeatures <= Math.min(objectionHandling, pricingDiscussions)
						? "Discovery depth and business impact quantification"
						: "Value-based pricing discussions",
		};

		// Insert the skills assessment
		await db.insert(schema.skillsAssessments).values({
			interactionId: interaction.interactionId,
			objectionHandlingScore: objectionHandling,
			pricingDiscussionsScore: pricingDiscussions,
			discoveryFeaturesScore: discoveryFeatures,
			closingScore: closing,
			assessmentData: assessmentData,
		});

		console.log(
			`  ✓ Created skills assessment for interaction ${interaction.interactionId} ` +
				`(OH: ${objectionHandling}, PR: ${pricingDiscussions}, DF: ${discoveryFeatures}, CL: ${closing})`,
		);
	}

	console.log(`\n✅ Successfully seeded ${interactionsWithRatings.length} skills assessments!`);
	console.log("\n📊 You can now view skills trends, distribution, and training insights in the UI.");
}

// Run the seed script
seedSkillsAssessments()
	.then(() => {
		console.log("\n🎉 Seeding complete!");
		process.exit(0);
	})
	.catch((error) => {
		console.error("\n❌ Error seeding skills assessments:", error);
		process.exit(1);
	});
