#!/usr/bin/env tsx
/**
 * CLI Job: Aggregate Feedback
 *
 * Runs the FeedbackAggregationService to process all feedback data
 * and update AI training context.
 *
 * Usage:
 *   pnpm tsx src/jobs/aggregate-feedback.ts [companyId]
 *
 * If companyId is provided, aggregates only for that company.
 * Otherwise, aggregates for all companies.
 */

import { FeedbackAggregationService } from "#/services/FeedbackAggregationService";

async function main() {
	const companyIdArg = process.argv[2];

	try {
		if (companyIdArg) {
			const companyId = Number.parseInt(companyIdArg, 10);
			if (Number.isNaN(companyId)) {
				console.error("Error: companyId must be a valid number");
				process.exit(1);
			}

			console.log(`Running feedback aggregation for company ${companyId}...`);
			await FeedbackAggregationService.aggregateCompanyFeedback(companyId);
			console.log(`Successfully completed feedback aggregation for company ${companyId}`);
		} else {
			console.log("Running feedback aggregation for all companies...");
			await FeedbackAggregationService.aggregateAllCompanies();
			console.log("Successfully completed feedback aggregation for all companies");
		}

		process.exit(0);
	} catch (error) {
		console.error("Error running feedback aggregation job:", error);
		process.exit(1);
	}
}

// Run the job if this file is executed directly
if (require.main === module) {
	main();
}
