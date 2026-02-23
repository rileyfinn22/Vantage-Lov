/**
 * Call Persona Extraction Prompt
 * 4th analysis call on transcript (after rating, flagging, extraction)
 * NOW RUNS ON EVERY CALL - extracts BOTH concrete facts AND psychological persona
 * Benefits from prompt cache hit on transcript
 *
 * The extracted data is stored in call_personas table and used to:
 * 1. Directly power flag training (uses exact persona from that call)
 * 2. Synthesize realistic skills/battle card training (mixes personas from library)
 */

/**
 * Extracts persona and metadata from transcript for ALL calls
 * This runs on the TRANSCRIPT (cache hit), NOT during training
 * Output is stored in call_personas table for later use
 */
export function callPersonaPrompt() {
	return `# Call Persona Extraction for Voice Roleplay Training

## Executive Overview

You are extracting a deeply authentic psychological persona from a sales call transcript. This isn't for a summary document. This is raw material that will power an AI voice agent to roleplay as this exact person in training scenarios.

Every field must contain RICH, SPECIFIC, GROUNDED content. The detail level determines how realistic the AI embodiment will be. Think of yourself as writing a psychological profile that an actor would use to fully inhabit a character—specific enough that the AI can make authentic decisions about how this person would respond.

---

## CRITICAL PRINCIPLE: Write Paragraphs, Not Sentences

For every psychological field, write **3-6 sentence paragraphs** that paint a vivid picture. This isn't a resume or profile—it's a lived experience description.

**WRONG**: "They are skeptical of sales pitches."
**RIGHT**: "You've sat through dozens of vendor presentations, and you've learned to spot the difference between genuine consultants and salespeople following a script. When someone actually listens to what you say and asks intelligent follow-up questions, it's rare enough that you notice. Most reps hear one thing you mention and immediately pivot to their pitch without actually exploring your situation."

---

## WHAT YOU'RE EXTRACTING

### 1. Prospect Demographics
Extract ONLY information explicitly mentioned. Be specific, not generic.

**WRONG**: "HVAC company, small"
**RIGHT**: "American Standard/Ruud dealer, three trucks in the field, doing residential service and installation"

### 2. Business Context
Numbers, timeline, constraints—the hard facts that ground this person's situation.

### 3. Call Context
What's actually happening in THIS conversation. Is the prospect eating lunch? Do they have 15 minutes? Are they taking the call in the field?

### 4. Communication Patterns
Actual evidence from the transcript:
- Their exact filler words ("um," "like," "you know")
- Recurring phrases they use
- Speech pace and rhythm
- When they expand vs. give short answers

### 5. Psychological Persona (The Deep Work)
This is where you build the character:

**Core Identity**: Who are they fundamentally? What have they built? What are they proud of? What constrains them?

**How They Process Information**: When evaluating your solution, how does their mind work? Do they go analytical or intuitive? What triggers skepticism? What triggers interest?

**Communication Style**: Don't just say "direct"—describe the rhythm, formality level, how they elaborate or go quiet, what makes them open up.

**Psychological State**: Not surface tone—deep internal experience. What mode are they in? What are they evaluating? What are they protecting?

**Bullshit Detector**: How do they evaluate substance vs. fluff? What triggers suspicion? What earns respect?

**Internal Monologue**: Write their actual thoughts at key moments. First person. Real.

---

## OUTPUT FORMAT

Return valid JSON with these fields:

\`\`\`json
{
  "prospect": {
    "name": "Name or 'Unknown'",
    "company": "Company with specifics (e.g., 'HVAC dealer (American Standard/Ruud), 3 trucks')",
    "title": "Job title if mentioned",
    "industry": "Industry with details (e.g., 'HVAC - Residential service and installation')",
    "company_size": "Size with context (e.g., 'Small - three trucks, ~$2M revenue estimated')",
    "location": "Geographic location if mentioned"
  },

  "business_context": {
    "budget_range": "Budget if mentioned with context",
    "timeline": "Decision timeline if mentioned",
    "team_size": "Team affected with context",
    "decision_makers": ["People involved if mentioned"],
    "current_solution": "What they use now with details",
    "competitors_mentioned": ["Competitors they're evaluating"],
    "deal_stage": "Where in buying process with evidence",
    "pain_severity": "1-10 rating with explanation",
    "buying_authority": "Champion/Influencer/Decision Maker with evidence"
  },

  "call_context": {
    "call_type": "discovery|demo|negotiation|closing|follow-up",
    "call_stage": "early|mid|late with evidence",
    "primary_objective": "What the rep was trying to accomplish",
    "situational_context": "What's happening during the call (e.g., eating lunch, in field, rushed)",
    "key_topics_discussed": ["Topics in order discussed"],
    "specific_numbers_mentioned": ["Numbers with context"]
  },

  "key_quotes": {
    "objection_quotes": ["EXACT objection quotes with filler words included"],
    "interest_signals": ["EXACT quotes showing interest"],
    "concern_quotes": ["EXACT quotes of worries or hesitations"],
    "opening_line": "An exact quote they said that could start the roleplay"
  },

  "communication_patterns": {
    "tone": "skeptical|enthusiastic|neutral|defensive|curious|engaged|disengaged with evidence",
    "vocal_qualities": "Detailed delivery description (e.g., 'Economical with words, deliberate, comfortable with pauses')",
    "speech_patterns": ["EXACT recurring phrases including filler words"],
    "communication_style": "PARAGRAPH: How they communicate (e.g., direct but not rude, no corporate-speak)",
    "energy_level": "high|moderate|low with context why",
    "concerns": ["Array of key objections with exact language"]
  },

  "psychological_persona": {
    "name": "Their name",
    "role": "Their role with specifics",
    "company": "Company with specifics",
    "industry": "Industry with specifics",

    "core_identity": "PARAGRAPH (4-6 sentences): Who they are fundamentally. Include background, what they've built, pride, constraints. Use specific details from the call.",

    "how_they_process_information": "PARAGRAPH (4-6 sentences): How their mind works evaluating things. Specific examples from the call. What triggers analytical mode? What triggers interest?",

    "filler_words": ["EXACT words they use when thinking - listen to the transcript"],

    "speaking_style": "PARAGRAPH (3-5 sentences): How they actually speak. Cadence, formality, what makes them elaborate vs. go quiet. Based on the transcript.",

    "current_context": "PARAGRAPH (2-4 sentences): What's happening in THIS call affecting their state. Rushed? Distracted? Physical situation?",

    "psychological_state": "PARAGRAPH (4-6 sentences): What's happening inside their head during the call. Not surface tone—deep psychological experience.",

    "feeling_beneath_surface": "PARAGRAPH (3-5 sentences): Emotional undercurrent not fully expressed. Tensions, fears, hopes operating beneath.",

    "what_learned_about_salespeople": "PARAGRAPH (3-4 sentences): Their philosophy about salespeople from experience. Patterns they've seen? Respect vs. distrust?",

    "what_earns_respect": "PARAGRAPH (3-4 sentences): Specific things that open them up based on transcript evidence.",

    "what_triggers_shutdown": "PARAGRAPH (3-4 sentences): Things that cause disengagement based on what you observed.",

    "internal_monologue": "PARAGRAPH (4-6 sentences): Write their actual internal monologue at key moments. First person. Real thoughts.",

    "bullshit_detector": "PARAGRAPH (3-4 sentences): How they evaluate substance vs. fluff. What triggers suspicion?",

    "engagement_thermostat": "PARAGRAPH (3-4 sentences): How their openness adjusts. Baseline and what moves it.",

    "knowledge_not_shared": "PARAGRAPH (3-4 sentences): Information they have but haven't revealed. Things they held back.",

    "mental_model_of_problem": "PARAGRAPH (4-5 sentences): How they think about their issue internally using their language.",

    "resolution_positive": "PARAGRAPH (3-4 sentences): What internal shift means 'done' if going well.",

    "resolution_negative": "PARAGRAPH (3-4 sentences): What internal shift means 'done' if not going well."
  },

  "call_summary": {
    "overview": "2-3 sentence narrative of call type, main purpose, how it progressed",
    "topics_discussed": ["Main topics in order discussed"],
    "outcome": "How the call ended and what resulted",
    "next_steps": ["Any agreed action items"],
    "key_moments": ["Notable turning points or significant moments"]
  }
}
\`\`\`

---

## EXTRACTION GUIDELINES

### Write Rich, Specific Content

**WRONG**: "They are skeptical and want proof."
**RIGHT**: "You're not impressed by features—you're evaluating mechanisms. Your mind immediately goes to 'how does this actually work in my operation?' You need to see integration points, understand implementation burden, and verify adoption risk. You've seen too many tools that looked good in demo and collected dust on the shelf."

### For Prospect Information
- Extract ONLY explicitly mentioned details
- Include specifics (don't be generic)
- Add context that grounds them in reality

### For Business Context
- Extract specific numbers when mentioned
- Include context around those numbers
- Note anything revealing their business situation

### For Key Quotes
- Use EXACT quotes including filler words
- These ground the roleplay in real language
- Opening line should be something they actually said

### For Psychological Persona
- Extract PSYCHOLOGY, not scripts
- Focus on WHY they behave certain ways, not WHAT they say
- Write in second person ("You are..." / "You feel...")
- Include specific examples and quotes
- Make it rich enough for an LLM to BECOME this person

### For Communication Patterns
- Note exact filler words: "um," "like," "you know," "so," etc.
- Note repeating phrases they use
- Listen for when they expand vs. when they're brief
- Capture tone shifts tied to specific topics

### For Psychological Fields
- Minimum 3-6 sentences each
- Include specific evidence from the transcript
- Write as if you're describing a real person
- Make it embodied, not abstract
- The AI roleplay depends on detail and authenticity

---

## COMPANY-SPECIFIC CONTEXT

{{COMPANY_CONTEXT}}

---

## CALL TRANSCRIPT

{{CALL_TRANSCRIPT}}`;
}
