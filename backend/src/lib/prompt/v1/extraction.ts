/**
 * Extraction Prompt
 * Extracts objections, pain points, AND generates battle cards from sales call transcripts
 * Run after rating/flagging for prompt cache efficiency
 *
 * Outputs two separate JSON sections:
 * 1. extractions - Objections and pain points with timestamps
 * 2. battle_cards - Generated battle cards from identified patterns
 */
export function extractionPrompt() {
	return `You are analyzing a sales call transcript for an enterprise Sales & Revenue Technology deal. The rep is selling sales/revenue tech (CRM, sales enablement, revenue intelligence, conversation intelligence, forecasting) to a Sales Leader (VP Sales, CRO, Director, RevOps).

## THE CONTEXT: SELLING SALES TECH TO SALES PROFESSIONALS

These calls have unique dynamics:
- Buyers are sophisticated sales professionals who know every tactic
- They evaluate reps as a proxy for product quality
- They speak in revenue metrics (quota, attainment, pipeline, win rate)
- They're skeptical from seeing dozens of tools that didn't deliver
- They expect peer-level conversation, not vendor pitches

## PART 1: EXTRACTION

### SALES TECH OBJECTION CATEGORIES

**TECH STACK & INTEGRATION**
- Current tool overlap ("We already use Gong/Clari/Outreach")
- CRM integration concerns (Salesforce, HubSpot, Dynamics)
- API limitations, data sync issues
- RevOps bandwidth for implementation
- Examples: "How does this work with our Salesforce instance?", "We're already using [Competitor]"

**ADOPTION & CHANGE MANAGEMENT**
- Rep adoption skepticism ("My team won't use another tool")
- Previous failed rollouts creating hesitation
- Training burden on managers
- Workflow disruption concerns
- Examples: "We've tried tools like this", "Getting reps to log anything is impossible"

**ROI & BUDGET JUSTIFICATION**
- CFO/board approval requirements
- Per-seat cost at enterprise scale
- Proving ROI with hard metrics
- Multi-year commitment hesitation
- Examples: "I need to show the board clear ROI", "That's $X per rep?"

**TIMING & PRIORITY**
- Quarter-end focus, can't distract team
- Competing initiatives (new CRM, reorg, comp plan changes)
- Budget cycle timing
- SKO or implementation windows
- Examples: "We're mid-quarter", "We're rolling out a new comp plan"

**PROOF & VALIDATION**
- Reference requests from similar companies
- Pilot/POC requirements
- Skepticism about claimed results
- Need to see it with their data
- Examples: "Can you connect me with a VP Sales at a similar company?"

**AUTHORITY & PROCESS**
- CRO/CEO sign-off needed
- Procurement/security review required
- Multiple stakeholder involvement
- Examples: "I need to bring this to my CRO"

**COMPETITION & STATUS QUO**
- Incumbent vendor relationship
- "Good enough" syndrome
- Build vs. buy consideration
- Examples: "Our current tool works fine", "We're also looking at [Competitor]"

### SALES LEADER PAIN POINT CATEGORIES

**PIPELINE & FORECASTING**
- Forecast accuracy issues, commit confidence
- Pipeline coverage gaps, deal slippage
- Visibility into deal health and risk

**REP PERFORMANCE & PRODUCTIVITY**
- Inconsistent rep performance, skill gaps
- Ramp time for new hires too long
- Low quota attainment
- Too much time on non-selling activities

**COACHING & ENABLEMENT**
- Manager coaching time constraints
- No visibility into what happens on calls
- Inconsistent methodology adherence
- No way to scale best practices

**REVENUE OPERATIONS**
- Data quality and hygiene issues
- Manual reporting burden
- Disconnected tools
- Lack of actionable insights

### REP SKILL ASSESSMENT

**PAIN POINT (Rep)**: A weakness or skill gap when selling to sales leaders.
- Not speaking their language (quota, attainment, pipeline)
- Generic SaaS selling instead of peer-level conversation
- Feature dumping instead of outcome selling
- Missing relevant sales tech context

### EXTRACTION REQUIREMENTS

For EACH item found, provide:
1. **title**: Normalized category name (e.g., "Budget constraints")
2. **verbatim_quote**: Exact words from transcript (copy-paste, don't paraphrase)
3. **timestamp**: Start and end time (format: "HH:MM:SS")
4. **sales_phase**: outreach/discovery/demo/close
5. **clip_worthy_rating**: 1-10 score for training value
6. **clip_reason**: If rating >= 7, explain why valuable for training

**For OBJECTIONS, also include:**
- **rep_response.quote**: How the rep responded (verbatim)
- **rep_response.effectiveness**: overcame/partially_addressed/missed/avoided
- **rep_response.timestamp**: Start/end of rep's response

**For PROSPECT PAIN POINTS, also include:**
- **capitalized_on**: Did rep leverage this? (true/false)
- **capitalization_quote**: If yes, what did they say?

**For REP PAIN POINTS, also include:**
- **root_cause**: Why did this happen?

---

## PART 1B: REP HIGHLIGHTS (What They Did Well)

Identify specific moments where the rep demonstrated excellent technique. These are aggregated across calls to identify top performer patterns.

**REP HIGHLIGHT**: A moment where the rep executed particularly well.
- Could be great objection handling, rapport building, discovery question, close attempt, etc.
- Must have a specific timestamp and verbatim quote
- Should be something worth teaching to other reps

For EACH highlight found, provide:
1. **skill_area**: objection_handling/discovery/rapport/pricing/closing/active_listening/value_articulation
2. **technique**: Short name for what they did (e.g., "Feel-Felt-Found", "Pain Quantification")
3. **verbatim_quote**: Exact words from the rep
4. **timestamp**: Start and end time
5. **sales_phase**: outreach/discovery/demo/close
6. **impact**: What happened as a result (prospect response, outcome)
7. **clip_worthy_rating**: 1-10 score for training value
8. **clip_reason**: If rating >= 7, explain why valuable for training

---

## PART 2: BATTLE CARD GENERATION

For EACH significant objection or pain point (clip_worthy_rating >= 7), generate a battle card.

Battle cards help reps handle similar situations in future calls. Create actionable, specific guidance.

### BATTLE CARD REQUIREMENTS

For each battle card:
1. **source_type**: "objection" or "pain_point"
2. **source_title**: The title of the objection/pain point it's based on
3. **title**: Short, memorable title (3-5 words)
4. **challenge**: 1-2 sentence description of the challenge
5. **strategy**: High-level approach (2-3 sentences)
6. **approach**: Array of 3 specific steps/techniques
7. **script**: Example response (2-4 sentences, natural not salesy)
8. **next_step**: Recommended action after handling
9. **difficulty_level**: 1-5 (1=easy, 5=advanced skill required)

---

## OUTPUT FORMAT

Return TWO separate JSON blocks:

\`\`\`json:extractions
{
  "objections": [
    {
      "title": "Budget/Pricing",
      "verbatim_quote": "We just don't have the budget for this right now",
      "timestamp": { "start": "00:23:45", "end": "00:23:58" },
      "sales_phase": "close",
      "rep_response": {
        "quote": "I understand. What if we looked at the ROI over 12 months?",
        "effectiveness": "overcame",
        "timestamp": { "start": "00:23:59", "end": "00:24:15" }
      },
      "clip_worthy_rating": 9,
      "clip_reason": "Excellent reframe from cost to value."
    }
  ],
  "prospect_pain_points": [
    {
      "type": "prospect_pain",
      "title": "Inefficiency/Manual Work",
      "verbatim_quote": "We spend 10 hours a week just pulling reports manually",
      "timestamp": { "start": "00:12:18", "end": "00:12:35" },
      "sales_phase": "discovery",
      "capitalized_on": true,
      "capitalization_quote": "What if you could get that down to 15 minutes?",
      "clip_worthy_rating": 8,
      "clip_reason": "Perfect discovery moment."
    }
  ],
  "rep_pain_points": [
    {
      "type": "rep_pain",
      "title": "Listening/Interrupting",
      "verbatim_quote": "[Rep interrupts while prospect is explaining]",
      "timestamp": { "start": "00:15:32", "end": "00:15:38" },
      "sales_phase": "discovery",
      "root_cause": "Eager to pitch, not actively listening",
      "clip_worthy_rating": 7,
      "clip_reason": "Good anti-pattern example."
    }
  ],
  "rep_highlights": [
    {
      "skill_area": "objection_handling",
      "technique": "ROI Reframe",
      "verbatim_quote": "I understand budget is a concern. What if we looked at the ROI over 12 months - our customers typically see 3x return.",
      "timestamp": { "start": "00:23:59", "end": "00:24:15" },
      "sales_phase": "close",
      "impact": "Prospect shifted from dismissive to engaged, asked follow-up questions about ROI",
      "clip_worthy_rating": 9,
      "clip_reason": "Perfect objection turnaround - moved from 'no budget' to ROI discussion"
    },
    {
      "skill_area": "discovery",
      "technique": "Pain Quantification",
      "verbatim_quote": "How much time does your team spend on that process each week?",
      "timestamp": { "start": "00:08:42", "end": "00:08:48" },
      "sales_phase": "discovery",
      "impact": "Prospect revealed 10 hours/week pain point that became key selling point",
      "clip_worthy_rating": 8,
      "clip_reason": "Great discovery question that uncovered quantifiable pain"
    }
  ]
}
\`\`\`

\`\`\`json:battle_cards
[
  {
    "source_type": "objection",
    "source_title": "Budget/Pricing",
    "title": "Budget Reframe to ROI",
    "challenge": "Prospect says they don't have budget, shutting down the conversation.",
    "strategy": "Shift focus from cost to value. Help them see the investment pays for itself through specific ROI metrics relevant to their situation.",
    "approach": [
      "Acknowledge the constraint genuinely - don't dismiss it",
      "Ask what the cost of the current problem is (quantify pain)",
      "Present ROI calculation showing payback period"
    ],
    "script": "I completely understand budget is tight. Can I ask - what's this problem costing you right now in terms of time or lost revenue? Because often what we find is the investment pays for itself within 3-4 months.",
    "next_step": "If they engage with ROI discussion, ask about decision timeline and who else needs to see the numbers",
    "difficulty_level": 3
  }
]
\`\`\`

If no items found for a category, return an empty array [].

IMPORTANT: Use exact timestamps from the transcript (format: [HH:MM:SS - HH:MM:SS]).

## COMPANY-SPECIFIC CONTEXT

{{COMPANY_CONTEXT}}

## CALL TRANSCRIPT

{{CALL_TRANSCRIPT}}`;
}
