/**
 * Test script for the Agentic Interaction Pipeline
 *
 * This script allows you to:
 * 1. Test with an existing interaction ID from the database
 * 2. Test with a raw transcript string
 *
 * Usage:
 *   # Test with existing interaction
 *   pnpm tsx scripts/test-agentic-pipeline.ts --interaction-id 123
 *
 *   # Test with transcript file
 *   pnpm tsx scripts/test-agentic-pipeline.ts --transcript-file path/to/transcript.txt
 *
 *   # Test with inline transcript
 *   pnpm tsx scripts/test-agentic-pipeline.ts --transcript "Rep: Hello! Prospect: Hi..."
 *
 *   # Dry run (show prompts without calling API)
 *   pnpm tsx scripts/test-agentic-pipeline.ts --interaction-id 123 --dry-run
 */

import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import {
	loadInteractionContext,
	loadAnalysisPrompts,
	runBranchedAnalysis,
	processInteractionBranchedPipeline,
} from "#/services/InteractionProcessingService";
import { AgenticFeatureOrchestrationService } from "#/services/AgenticFeatureOrchestrationService";
import { logger } from "#/lib/logger";

// Parse command line args
const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
	const idx = args.indexOf(`--${name}`);
	return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
};
const hasFlag = (name: string): boolean => args.includes(`--${name}`);

const interactionId = getArg("interaction-id");
const transcriptFile = getArg("transcript-file");
const transcriptInline = getArg("transcript");
const dryRun = hasFlag("dry-run");
const useAgentic = hasFlag("agentic");
const verbose = hasFlag("verbose");

async function main() {
	console.log("\n🔬 Vantage Agentic Pipeline Test\n");
	console.log("=".repeat(60));

	if (!interactionId && !transcriptFile && !transcriptInline) {
		console.log(`
Usage:
  pnpm tsx scripts/test-agentic-pipeline.ts --interaction-id <id>
  pnpm tsx scripts/test-agentic-pipeline.ts --transcript-file <path>
  pnpm tsx scripts/test-agentic-pipeline.ts --transcript "<text>"

Options:
  --dry-run     Show prompts without calling API
  --agentic     Use agentic orchestration (SupervisorAgentRunner)
  --verbose     Show detailed output

Examples:
  # List available interactions first
  pnpm tsx scripts/test-agentic-pipeline.ts --list

  # Test with interaction ID
  pnpm tsx scripts/test-agentic-pipeline.ts --interaction-id 5 --verbose

  # Test with agentic pipeline
  pnpm tsx scripts/test-agentic-pipeline.ts --interaction-id 5 --agentic
`);

		// List some interactions if --list flag
		if (hasFlag("list")) {
			console.log("\n📋 Recent Interactions:\n");
			const interactions = await db
				.select({
					id: schema.interactions.id,
					blurb: schema.interactions.blurb,
					processedStatus: schema.interactions.processedStatus,
					createdAt: schema.interactions.createdAt,
				})
				.from(schema.interactions)
				.orderBy(schema.interactions.id)
				.limit(20);

			for (const i of interactions) {
				console.log(`  [${i.id}] ${i.processedStatus?.padEnd(12)} ${i.blurb?.slice(0, 50) ?? "(no blurb)"}`);
			}
		}

		process.exit(0);
	}

	// Load prompts first
	console.log("\n📝 Loading Analysis Prompts...\n");
	const prompts = await loadAnalysisPrompts();

	if (dryRun || verbose) {
		console.log("Rating Prompt (first 500 chars):");
		console.log("-".repeat(40));
		console.log(prompts.ratingPromptText.slice(0, 500) + "...\n");

		console.log("Flagging Prompt (first 500 chars):");
		console.log("-".repeat(40));
		console.log(prompts.flaggingPromptText.slice(0, 500) + "...\n");

		console.log("Extraction Prompt (first 500 chars):");
		console.log("-".repeat(40));
		console.log(prompts.extractionPromptText.slice(0, 500) + "...\n");

		console.log("Persona Prompt (first 500 chars):");
		console.log("-".repeat(40));
		console.log(prompts.personaPromptText.slice(0, 500) + "...\n");
	}

	if (dryRun) {
		console.log("✅ Dry run complete - prompts loaded successfully");
		process.exit(0);
	}

	// Test with interaction ID
	if (interactionId) {
		const id = parseInt(interactionId, 10);
		console.log(`\n🎯 Testing with Interaction ID: ${id}\n`);

		// Load context
		console.log("Loading interaction context...");
		let context;
		try {
			context = await loadInteractionContext({ interactionId: id });
			console.log(`  ✅ Found interaction for salesperson ${context.salespersonId}, company ${context.companyId}`);
			console.log(`  📄 Transcript length: ${context.textToAnalyze.length} chars`);
			if (context.companyContextFormatted) {
				console.log(`  🏢 Company context loaded (${context.companyContextFormatted.length} chars)`);
			}
		} catch (error: any) {
			console.error(`  ❌ Failed to load context: ${error.message}`);
			process.exit(1);
		}

		if (verbose) {
			console.log("\nTranscript Preview (first 1000 chars):");
			console.log("-".repeat(40));
			console.log(context.textToAnalyze.slice(0, 1000) + "...\n");
		}

		// Run analysis
		if (useAgentic) {
			console.log("\n🤖 Running AGENTIC Pipeline (SupervisorAgentRunner)...\n");

			const startTime = Date.now();
			const result = await AgenticFeatureOrchestrationService.run({
				feature: "interaction_branched_pipeline",
				input: { interactionId: id },
				ctx: { workflowStateId: 0, workflowType: "test", workflowId: "test-run", metadata: {} },
			});
			const duration = Date.now() - startTime;

			console.log(`\n⏱️  Completed in ${(duration / 1000).toFixed(2)}s\n`);
			console.log("Output:");
			console.log("-".repeat(40));
			console.log(JSON.stringify(result.output, null, 2));

			if (verbose) {
				console.log("\nTrace:");
				console.log("-".repeat(40));
				console.log(JSON.stringify(result.trace, null, 2));
			}
		} else {
			console.log("\n🔄 Running DIRECT Pipeline (processInteractionBranchedPipeline)...\n");

			const startTime = Date.now();
			const result = await processInteractionBranchedPipeline({ interactionId: id });
			const duration = Date.now() - startTime;

			console.log(`\n⏱️  Completed in ${(duration / 1000).toFixed(2)}s\n`);
			console.log("Result:");
			console.log("-".repeat(40));
			console.log(JSON.stringify(result, null, 2));
		}

		// Show what was saved
		console.log("\n📊 Checking Saved Results...\n");

		const ratings = await db
			.select()
			.from(schema.ratings)
			.where(eq(schema.ratings.interactionId, id))
			.orderBy(schema.ratings.id);
		console.log(`  Ratings: ${ratings.length}`);
		if (ratings.length > 0 && verbose) {
			console.log(`    Latest: ${ratings[ratings.length - 1].value}/100`);
		}

		const flags = await db
			.select()
			.from(schema.flags)
			.where(eq(schema.flags.interactionId, id));
		console.log(`  Flags: ${flags.length}`);
		if (flags.length > 0 && verbose) {
			for (const flag of flags) {
				const data = flag.flagData as any;
				console.log(`    - ${data?.flag_title ?? "Unknown"}`);
			}
		}

		const personas = await db
			.select()
			.from(schema.callPersonas)
			.where(eq(schema.callPersonas.interactionId, id));
		console.log(`  Personas: ${personas.length}`);
		if (personas.length > 0 && verbose) {
			const p = personas[personas.length - 1];
			console.log(`    Latest: ${p.prospectName ?? "Unknown"} @ ${p.prospectCompany ?? "Unknown"}`);
		}
	}

	// Test with transcript file or inline
	if (transcriptFile || transcriptInline) {
		const transcript = transcriptFile
			? readFileSync(transcriptFile, "utf-8")
			: transcriptInline!;

		console.log(`\n📝 Testing with transcript (${transcript.length} chars)\n`);

		if (verbose) {
			console.log("Transcript Preview:");
			console.log("-".repeat(40));
			console.log(transcript.slice(0, 1000) + (transcript.length > 1000 ? "..." : ""));
			console.log();
		}

		console.log("Running analysis (no persistence)...\n");

		const startTime = Date.now();
		const result = await runBranchedAnalysis({
			interactionId: 0, // dummy
			textToAnalyze: transcript,
			companyContextFormatted: undefined,
			prompts,
		});
		const duration = Date.now() - startTime;

		console.log(`⏱️  Completed in ${(duration / 1000).toFixed(2)}s\n`);

		console.log("Rating:");
		console.log("-".repeat(40));
		console.log(JSON.stringify(result.rating, null, 2));

		console.log("\nFlagging:");
		console.log("-".repeat(40));
		console.log(JSON.stringify(result.flagging, null, 2));

		console.log("\nExtraction:");
		console.log("-".repeat(40));
		console.log(JSON.stringify(result.extraction, null, 2));

		console.log("\nPersona:");
		console.log("-".repeat(40));
		console.log(JSON.stringify(result.personaWithRoleplay, null, 2));
	}

	console.log("\n✅ Test complete!\n");
	process.exit(0);
}

main().catch((error) => {
	console.error("\n❌ Error:", error);
	process.exit(1);
});
