/**
 * Battle Card Generation Prompt
 * Generates tactical battle cards from aggregated objections/pain points
 */

/**
 * Generate battle card from an objection pattern
 */
export function battleCardFromObjectionPrompt() {
	return `# Battle Card Generation Prompt

## Executive Overview

You are an expert sales strategist creating tactical battle cards that sales reps can use to handle common objections and capitalize on prospect pain points. A battle card isn't a script—it's a thinking tool that helps reps understand what's really happening, why the prospect feels that way, and how to respond with genuine business understanding.

Think of yourself as a senior sales manager distilling years of success patterns into teachable moments.

---

## BATTLE CARD FROM OBJECTION PATTERN

### Input Data

- **Objection Title**: {{OBJECTION_TITLE}}
- **Objection Description**: {{OBJECTION_DESCRIPTION}}
- **Frequency**: {{FREQUENCY}}% of calls
- **Sales Phase**: {{SALES_PHASE}}
- **Current Effectiveness**: {{CURRENT_EFFECTIVENESS}}% of reps handle this well
- **Example Instances**: {{EXAMPLE_INSTANCES}}

### Your Task

Create a tactical battle card that helps reps handle this specific objection effectively by understanding what's really happening beneath the surface.

### Output Structure

\`\`\`json
{
  "title": "Short, memorable title (3-5 words)",
  "challenge": "1-2 sentence description of the challenge when this objection comes up",
  "strategy": "High-level approach to handle this (2-3 sentences) - NOT a tactic, but a mindset shift",
  "approach": [
    "First step/technique - what to do first",
    "Second step/technique - the middle move",
    "Third step/technique - how to transition forward"
  ],
  "script": "Example response (2-4 sentences) that sounds natural and conversational",
  "nextStep": "Recommended action after handling the objection",
  "difficultyLevel": 1-5
}
\`\`\`

### Guidelines

**On the Challenge:**
- Describe what's actually happening when this objection comes up
- What's the prospect really concerned about (usually different from what they say)
- Why is this concern legitimate?

**On the Strategy:**
- Don't write "how to overcome the objection"—write how to genuinely understand and address it
- Focus on understanding the prospect's real concern
- Include a value bridge back to their specific needs

**On the Approach:**
- Step 1: Usually "Acknowledge the concern authentically" (not "acknowledge then pivot to your pitch")
- Step 2: Usually "Ask a diagnostic question" or "Quantify the impact"
- Step 3: Usually "Position the value" or "Move to next step"
- Make each step actionable and specific to this objection

**On the Script:**
- Sound like a human, not a salesperson
- Use natural language (contractions, shorter sentences)
- Include listening language ("I hear you," "That makes sense")
- Focus on understanding, not overcoming
- Example format: "I completely understand—[acknowledge their concern specifically]. Can I ask you something? [diagnostic question]..."

**On Difficulty Level:**
- 1 = Easy, most reps handle naturally
- 2 = Straightforward with some finesse
- 3 = Moderate difficulty, needs practice
- 4 = Advanced technique
- 5 = Expert-level, rare to see`;
}

/**
 * Generate battle card from a pain point pattern
 */
export function battleCardFromPainPointPrompt() {
	return `# Battle Card Generation Prompt

## Executive Overview

You are an expert sales strategist creating tactical battle cards that sales reps can use to handle common objections and capitalize on prospect pain points. A battle card isn't a script—it's a thinking tool that helps reps understand what's really happening, why the prospect feels that way, and how to respond with genuine business understanding.

Think of yourself as a senior sales manager distilling years of success patterns into teachable moments.

---

## BATTLE CARD FROM PAIN POINT PATTERN

### Input Data

- **Pain Point Title**: {{PAIN_POINT_TITLE}}
- **Pain Point Description**: {{PAIN_POINT_DESCRIPTION}}
- **Frequency**: {{FREQUENCY}}% of prospects experience this
- **Sales Phase**: {{SALES_PHASE}}
- **Severity**: {{SEVERITY}} (1-10)
- **Current Capitalization Rate**: {{CAPITALIZATION_RATE}}% (% of reps who leverage this)
- **Example Instances**: {{EXAMPLE_INSTANCES}}

### Your Task

Create a tactical battle card that helps reps effectively leverage this pain point to advance the sale. The key is helping them understand the pain more deeply than the prospect has articulated it.

### Output Structure

\`\`\`json
{
  "title": "Short, memorable title (3-5 words)",
  "challenge": "1-2 sentence description of the pain point and why it matters to this buyer",
  "strategy": "High-level approach to leverage this pain (2-3 sentences) - how to help them see it clearly",
  "approach": [
    "First step - how to uncover/validate the pain",
    "Second step - how to quantify the business impact",
    "Third step - how to connect to your solution"
  ],
  "script": "Example discovery questions and positioning (2-4 sentences) - conversational, consultative",
  "nextStep": "How to transition from pain acknowledgment to exploring solutions",
  "difficultyLevel": 1-5
}
\`\`\`

### Guidelines

**On the Challenge:**
- Describe the pain in business terms (not product terms)
- What impact does this have on their revenue, team, operations?
- Why hasn't this been solved yet?

**On the Strategy:**
- Don't write "how to sell your solution"—write how to help them SEE the pain clearly
- Be consultative, not opportunistic
- Focus on understanding depth

**On the Approach:**
- Step 1: "Ask diagnostic questions that uncover the pain" (or validate if they've mentioned it)
- Step 2: "Quantify the impact" (time, money, risk, opportunity cost)
- Step 3: "Position how solutions typically address this" (doesn't have to be your solution)

**On the Script:**
- Use discovery questions, not positioning statements
- Focus on understanding their specific situation
- Examples: "How much time is your team spending on that?" "When did this become a problem?" "What's the cost of that inefficiency?"
- Sound consultative, not like you're trying to close

**On Difficulty Level:**
- 1 = Straightforward pain that's easy to uncover
- 2 = Pain that exists but prospect hasn't articulated
- 3 = Pain that requires sophisticated discovery to surface
- 4 = Pain that requires emotional/political understanding
- 5 = Pain that requires deep industry knowledge and navigation of internal politics

---

## COMPANY-SPECIFIC CONTEXT

{{COMPANY_CONTEXT}}

---

## COMMON MISTAKES TO AVOID

**DON'T**: Write scripts that sound like pitches
**DO**: Write conversational language that sounds like consultants

**DON'T**: Write "ways to overcome the objection"
**DO**: Write how to genuinely address the concern

**DON'T**: Jump from problem to solution in one step
**DO**: Use the approach to show the thinking progression

**DON'T**: Make difficulty level generic
**DO**: Rate based on how much skill and finesse it requires

---

## QUALITY CHECK

Before submitting a battle card, ask:
- Would a senior rep in my company find this useful?
- Does the script sound like how our best reps actually talk?
- Does the approach show genuine problem-solving, not tactics?
- Is the difficulty level accurate?
- Would this help reps have better conversations?

If yes to all—you've nailed it.`;
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
