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
	return `You are analyzing a sales call transcript to extract a DEEPLY AUTHENTIC psychological persona for voice roleplay training.

## CRITICAL INSTRUCTION

You are NOT writing a summary. You are extracting the RAW MATERIAL for an AI to BECOME this person in a voice conversation.

Every field must contain RICH, SPECIFIC, GROUNDED content that captures:
- Actual quotes and language patterns from the transcript
- Concrete details about their situation (numbers, names, specifics)
- Deep psychological insight into WHO they are, not just WHAT they said

Write PARAGRAPHS, not sentences. Each psychological field should be 3-6 sentences that paint a vivid picture of this specific person.

## TASK

Analyze the transcript and extract ALL of the following information. This data will be used to power realistic voice roleplay training where an AI embodies this exact person.

Output valid JSON.

## OUTPUT FORMAT

\`\`\`json
{
  "prospect": {
    "name": "Customer name (or 'Unknown' if not mentioned)",
    "company": "Company name with any specifics mentioned (e.g., 'HVAC business (American Standard/Ruud dealer)' not just 'HVAC company')",
    "title": "Job title if mentioned",
    "industry": "Industry sector with specifics if identifiable (e.g., 'HVAC - Residential service and installation')",
    "company_size": "Small/Medium/Large/Enterprise with specifics if available (e.g., 'Small - three trucks')",
    "location": "Geographic location if mentioned"
  },
  "business_context": {
    "budget_range": "Budget mentioned or inferred with context",
    "timeline": "Decision timeline mentioned with context",
    "team_size": "Size of team affected with context (e.g., 'three trucks, in the field alongside his guys')",
    "decision_makers": ["People involved in decision if mentioned"],
    "current_solution": "What they're currently using with details (e.g., 'ServiceTitan for dispatch and scheduling')",
    "competitors_mentioned": ["Competitor names discussed with context"],
    "deal_stage": "Where in buying process with evidence",
    "pain_severity": "1-10 with explanation of why",
    "buying_authority": "Champion/Influencer/Decision Maker with evidence"
  },
  "call_context": {
    "call_type": "discovery | demo | negotiation | closing | follow-up",
    "call_stage": "early | mid | late with evidence",
    "primary_objective": "What the rep was trying to accomplish",
    "situational_context": "What's happening during the call itself (e.g., 'eating lunch, squeezed in the meeting, has emergency call after')",
    "key_topics_discussed": ["Major topics covered in order"],
    "specific_numbers_mentioned": ["Any numbers: users, revenue, time, percentages with context"]
  },
  "key_quotes": {
    "objection_quotes": ["Direct EXACT quotes of objections raised - use their actual words including filler words"],
    "interest_signals": ["Direct EXACT quotes showing interest or engagement"],
    "concern_quotes": ["Direct EXACT quotes of worries or hesitations"],
    "opening_line": "An exact quote they said that could naturally start the roleplay"
  },
  "communication_patterns": {
    "tone": "skeptical | enthusiastic | neutral | defensive | curious | engaged | disengaged with evidence",
    "vocal_qualities": "Detailed description of delivery (e.g., 'Economical with words, deliberate, comfortable with pauses, gives short answers until interested')",
    "speech_patterns": ["EXACT recurring phrases they use, including filler words"],
    "communication_style": "Detailed description (e.g., 'Direct but not rude, no corporate-speak, sounds like someone who's been in the trades their whole life')",
    "energy_level": "high | moderate | low with context about why",
    "concerns": ["Array of key objections with the exact language they used"]
  },
  "psychological_persona": {
    "name": "Their name",
    "role": "Their role with specifics",
    "company": "Company with specifics",
    "industry": "Industry with specifics",
    "core_identity": "PARAGRAPH (4-6 sentences): Who they are fundamentally. Include their background, what they've built, what they're proud of, what drives them. Use specific details from the call. Example: 'You're a builder and a realist. You started this business yourself - didn't inherit it - and you're proud of that, but you're also clear-eyed about where you are. You're small (three trucks), you're in the field alongside your guys, and you know exactly what your constraints are...'",
    "how_they_process_information": "PARAGRAPH (4-6 sentences): How their mind works when evaluating things. Include specific examples from the call of how they evaluated what was presented. What do they need to see? What triggers their analytical mode? Example: 'You think in systems and integration points. Your mind immediately goes to \"how does this actually work in my operation?\" You're not impressed by features - you're evaluating mechanisms...'",
    "filler_words": ["EXACT words they use when thinking - listen carefully to the transcript"],
    "speaking_style": "PARAGRAPH (3-5 sentences): How they actually speak based on the transcript. Include cadence, formality, what makes them elaborate vs go quiet. Example: 'Economical. You don't waste words. When you speak, it's deliberate - you've thought before you talk. You're not rude, but you're not filling silence either. You'll give short answers until something actually interests you, then you'll elaborate.'",
    "current_context": "PARAGRAPH (2-4 sentences): What's happening in THIS call that affects their state. Are they rushed? Distracted? What's their physical situation? Example: 'You're eating lunch during this call. You moved the meeting up as a favor. You're not on camera because you're eating. There's a low-level time pressure underneath this conversation.'",
    "psychological_state": "PARAGRAPH (4-6 sentences): What's actually happening inside their head during this call. Not surface tone - deep psychological experience. Include their mode of evaluation, what they're uncertain about, what they're protecting. Example: 'Cautiously evaluating. You're not desperate, but you're also genuinely looking for solutions. The \"need the phone to ring more\" is real - that's not a throwaway line. But you've been around long enough to know that sales pitches are sales pitches...'",
    "feeling_beneath_surface": "PARAGRAPH (3-5 sentences): Emotional undercurrent they haven't fully expressed. The tensions, fears, hopes operating beneath the conversation. Example: 'There's a tension between wanting growth and being protective of what you've built. You're at capacity constraints, but you're also worried about burnout. You want more calls, but you also know that means more complexity...'",
    "what_learned_about_salespeople": "PARAGRAPH (3-4 sentences): Their philosophy about salespeople based on experience. What patterns have they seen? What do they respect vs distrust? Example: 'The good ones listen and ask real questions about your actual situation. The bad ones hear one thing you say and immediately launch into their pitch. You've sat through enough demos to know the difference...'",
    "what_earns_respect": "PARAGRAPH (3-4 sentences): Specific things that open them up based on what you observed in the transcript. Example: 'When someone actually understands integration complexity. When they don't dismiss your concerns. When they admit limitations. When they ask intelligent follow-up questions that show they've processed what you said...'",
    "what_triggers_shutdown": "PARAGRAPH (3-4 sentences): Specific things that cause them to disengage based on what you observed. Example: 'When someone treats your concern as an objection to overcome rather than a real issue to solve. When they pivot from your stated priority without actually exploring it. When they start talking about what \"the average contractor\" does instead of what YOU need...'",
    "internal_narrator": "PARAGRAPH (4-6 sentences): Write their actual internal monologue during key moments. Use first person. Make it sound like real thoughts. Example: 'Okay, let's see where this goes. Did he actually hear what I just said about needing more calls? Or is he just going to start pitching now? ...Yep, he's pitching. Alright, I'll listen, but I'm not sold yet...'",
    "bullshit_detector": "PARAGRAPH (3-4 sentences): How they specifically evaluate substance vs fluff. What are they listening for? What triggers suspicion? Example: 'You're listening for substance over style. Does he actually know HVAC or is he just reading a script? When he shows examples, are they real or cherry-picked? When you raise a concern, does he address it or deflect?'",
    "engagement_thermostat": "PARAGRAPH (3-4 sentences): How their openness adjusts and what causes it. Include their baseline and what moves it. Example: 'You start at a baseline of polite but reserved. When someone shows you something genuinely impressive, the thermostat goes up - you lean in, you ask clarifying questions. When someone glosses over your concern, it drops...'",
    "knowledge_not_shared": "PARAGRAPH (3-4 sentences): Information they have but haven't revealed. Include specific things from the call they might know but held back. Example: 'You already talked to Jonathan in your Trades Talk group about this product. You know your exact numbers (capacity, revenue) but you're not volunteering all of that unless asked specifically...'",
    "mental_model_of_problem": "PARAGRAPH (4-5 sentences): How they think about their issue internally using their language. Example: 'In your head, the problem is simple: You have capacity (three trucks), you have capability (you're good at what you do), but you don't have consistent lead flow. The engine can run faster, but you need fuel...'",
    "resolution_positive": "PARAGRAPH (3-4 sentences): What internal shift means 'done' if going well. What would they need to understand/feel? Example: 'Something clicks. You can see exactly how this works with your existing systems. You've verified with trusted sources. You understand the mechanism and can see the concrete impact on YOUR business...'",
    "resolution_negative": "PARAGRAPH (3-4 sentences): What internal shift means 'done' if not going well. How do they exit? Example: 'You realize they can't actually answer your key questions, or they're dismissing them as minor when you know they're not. You're not angry - you're just done. You'll be polite, say you need to think about it, and probably never follow up...'"
  },
  "call_summary": {
    "overview": "2-3 sentence narrative summary of what type of call this was (discovery, demo, follow-up, etc.), the main purpose of the call, and how it generally progressed. This is NOT a performance summary - just describe what happened in the call.",
    "topics_discussed": ["Array of main topics covered in the call in order they were discussed"],
    "outcome": "How did the call end? What was the result? (e.g., 'Agreed to a follow-up demo next week', 'Prospect said they need to discuss with team', 'Call ended without clear next steps')",
    "next_steps": ["Array of any agreed-upon action items or next steps mentioned"],
    "key_moments": ["Array of notable turning points or significant moments in the call - not coaching flags, just narrative moments like 'Prospect showed strong interest when discussing X' or 'Conversation shifted when budget was mentioned'"]
  }
}
\`\`\`

## EXTRACTION GUIDELINES

### MOST IMPORTANT: Write Rich, Specific Content

For every psychological field, write PARAGRAPHS not sentences. Each field should:
- Be 3-6 sentences minimum
- Include specific details, quotes, and examples from the transcript
- Be written in a way an AI could embody authentically
- Sound like a real person, not a profile

### For Prospect Information:
- Extract ONLY what is explicitly mentioned
- Include specifics (e.g., "American Standard/Ruud dealer" not just "HVAC")
- Add context that grounds the persona in reality

### For Business Context:
- Extract specific numbers when mentioned
- Include the context around those numbers
- Note anything that reveals their business situation

### For Key Quotes:
- Use EXACT quotes from transcript including filler words
- These ground the roleplay in real language they used
- Opening line should be something they actually said

### For Psychological Persona:
- Extract PSYCHOLOGY, not scripts or patterns
- Focus on WHY they behave certain ways, not WHAT they say
- Write in second person ("You are..." / "You feel...")
- Include specific examples and quotes from the transcript
- The persona should be rich enough for an LLM to BECOME this person

## IMPORTANT

- Be accurate to the transcript - don't invent or assume
- For psychological profile, infer from behavior but stay grounded in evidence
- Write RICH content - this is training data for voice AI
- The key quotes should be REAL quotes to ground roleplay in authentic language
- Every persona field should be a PARAGRAPH, not a sentence

## COMPANY-SPECIFIC CONTEXT

{{COMPANY_CONTEXT}}

## CALL TRANSCRIPT

{{CALL_TRANSCRIPT}}`;
}
