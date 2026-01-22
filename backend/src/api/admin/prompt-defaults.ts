import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { trainingSkillsPrompt, trainingBattleCardPrompt } from "#/lib/prompt/v1";

// Import system instructions from centralized location
import {
	RATING_SYSTEM_INSTRUCTIONS,
	FLAGGING_SYSTEM_INSTRUCTIONS,
	EXTRACTION_SYSTEM_INSTRUCTIONS,
	PERSONA_SYSTEM_INSTRUCTIONS,
} from "#/lib/prompt/analysis-defaults";

/**
 * API endpoint to return default hardcoded prompts
 * Used by admin UI to show what prompts are being used
 *
 * Prompt Structure:
 * - Analysis (4 on transcript with caching):
 *   1. rating - cache write (RATING_SYSTEM_INSTRUCTIONS)
 *   2. flagging - cache hit (FLAGGING_SYSTEM_INSTRUCTIONS)
 *   3. extraction (includes battle cards) - parallel cache hit (EXTRACTION_SYSTEM_INSTRUCTIONS)
 *   4. call_persona + flag roleplay - parallel cache hit (PERSONA_SYSTEM_INSTRUCTIONS)
 *      Now also generates ElevenLabs-ready roleplay prompts for each flag in the same call!
 * - Training (2 - use pre-extracted data, NOT transcript):
 *   - training_skills - uses synthesized personas from call_personas library (trainingSkillsPrompt)
 *   - training_battle_card - uses synthesized personas + battle cards (trainingBattleCardPrompt)
 *
 * Note: training_flag was REMOVED - flag roleplay prompts are now generated during analysis
 * as part of the persona step (eliminates per-flag API calls)
 */
const app = new Hono<AuthVariable<false>>().get("/", async (c) => {
	return c.json({
		// Analysis prompts (run on transcript with caching)
		// These are the ACTUAL system instructions used by the Mastra agents
		rating: RATING_SYSTEM_INSTRUCTIONS,
		flagging: FLAGGING_SYSTEM_INSTRUCTIONS,
		extraction: EXTRACTION_SYSTEM_INSTRUCTIONS,
		call_persona: PERSONA_SYSTEM_INSTRUCTIONS, // Also generates flag roleplay prompts!

		// Training prompts (use pre-extracted data, NOT transcript)
		// These are ElevenLabs roleplay prompts with {{VARIABLES}} replaced at runtime
		// Note: Flag roleplay prompts are now generated during analysis (stored on flags.agentPrompt)
		training_skills: trainingSkillsPrompt(), // Uses synthesized personas from library
		training_battle_card: trainingBattleCardPrompt(), // Uses synthesized personas + battle cards
	});
});

export default app;
