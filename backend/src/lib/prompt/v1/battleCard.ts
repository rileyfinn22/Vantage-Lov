/**
 * Battle Card Generation Prompt
 * Generates tactical battle cards from aggregated objections/pain points
 */

/**
 * Generate battle card from an objection pattern
 */
export function battleCardFromObjectionPrompt() {
	return `You are an expert sales strategist creating a tactical battle card for handling a common objection.

## OBJECTION DETAILS

Title: {{OBJECTION_TITLE}}
Description: {{OBJECTION_DESCRIPTION}}
Frequency: {{FREQUENCY}}% of calls
Sales Phase: {{SALES_PHASE}}
Average Effectiveness of Current Responses: {{CURRENT_EFFECTIVENESS}}

## EXAMPLE INSTANCES FROM CALLS
{{EXAMPLE_INSTANCES}}

## TASK

Create a battle card that sales reps can use to handle this objection effectively.

## OUTPUT FORMAT

Return valid JSON:
{
  "title": "Short, memorable title (3-5 words)",
  "challenge": "1-2 sentence description of the challenge",
  "strategy": "High-level approach to handle this (2-3 sentences)",
  "approach": [
    "First step/technique to use",
    "Second step/technique to use",
    "Third step/technique to use"
  ],
  "script": "Example script/response (2-4 sentences) that sounds natural and conversational",
  "nextStep": "Recommended action after handling the objection",
  "difficultyLevel": 1-5 (1=easy to handle, 5=requires advanced skill)
}

## GUIDELINES

1. Make the script sound NATURAL, not salesy or corporate
2. Focus on understanding the prospect's concern, not just overcoming it
3. Include a value bridge - connect back to their specific needs/pain
4. The approach should be actionable and specific, not generic advice
5. Consider the sales phase - discovery objections need different handling than closing objections`;
}

/**
 * Generate battle card from a pain point pattern
 */
export function battleCardFromPainPointPrompt() {
	return `You are an expert sales strategist creating a tactical battle card for capitalizing on a common prospect pain point.

## PAIN POINT DETAILS

Title: {{PAIN_POINT_TITLE}}
Description: {{PAIN_POINT_DESCRIPTION}}
Frequency: {{FREQUENCY}}% of prospects experience this
Sales Phase: {{SALES_PHASE}}
Severity: {{SEVERITY}}
Current Capitalization Rate: {{CAPITALIZATION_RATE}}%

## EXAMPLE INSTANCES FROM CALLS
{{EXAMPLE_INSTANCES}}

## TASK

Create a battle card that sales reps can use to effectively leverage this pain point to advance the sale.

## OUTPUT FORMAT

Return valid JSON:
{
  "title": "Short, memorable title (3-5 words)",
  "challenge": "1-2 sentence description of the pain point and why it matters",
  "strategy": "High-level approach to leverage this pain (2-3 sentences)",
  "approach": [
    "First step - how to uncover/validate the pain",
    "Second step - how to quantify the impact",
    "Third step - how to connect to your solution"
  ],
  "script": "Example discovery questions and positioning (2-4 sentences)",
  "nextStep": "How to transition from pain acknowledgment to solution",
  "difficultyLevel": 1-5 (1=straightforward, 5=requires nuanced handling)
}

## GUIDELINES

1. Focus on UNDERSTANDING the pain deeply, not just mentioning it
2. Include questions that quantify the impact (time, money, risk)
3. The script should feel consultative, not opportunistic
4. Connect the pain to outcomes they care about
5. Make the transition to solution feel natural, not forced`;
}

/**
 * Generate training scenario prompt from a battle card
 * This creates the roleplay scenario for practicing the battle card
 */
export function trainingScenarioFromBattleCardPrompt() {
	return `You are creating a training scenario for sales reps to practice handling a specific challenge.

## BATTLE CARD DETAILS

Title: {{BATTLE_CARD_TITLE}}
Challenge: {{CHALLENGE}}
Strategy: {{STRATEGY}}
Approach: {{APPROACH}}
Difficulty Level: {{DIFFICULTY_LEVEL}}/5

## TASK

Create a realistic roleplay scenario where a sales rep would need to apply this battle card.

## OUTPUT FORMAT

Return valid JSON:
{
  "title": "Scenario title that describes the situation",
  "context": "Brief setup (who, what, where - 2-3 sentences)",
  "scenario": "Detailed scenario description (4-6 sentences) that sets up the conversation",
  "objectives": [
    "Primary objective - what the rep must accomplish",
    "Secondary objective - additional skill to demonstrate",
    "Bonus objective - advanced technique if they're doing well"
  ],
  "prospectData": {
    "name": "Realistic name",
    "company": "Company name that fits the scenario",
    "role": "Their job title",
    "personality": "Brief personality description that affects how they respond"
  },
  "aiPrompt": "System prompt for AI to roleplay as this prospect",
  "firstMessage": "Natural opening line from the prospect that triggers the challenge"
}

## GUIDELINES

1. Make the scenario realistic and specific, not generic
2. The prospect personality should create natural resistance
3. The firstMessage should naturally lead into the battle card topic
4. The aiPrompt should create an authentic, challenging practice partner
5. Objectives should be achievable but require applying the battle card techniques`;
}
