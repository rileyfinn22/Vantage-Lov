import { getAnthropicClient, ANTHROPIC_MODEL } from "#/lib/anthropic";
import { CompanyAIContextService, type CallType } from "./CompanyAIContextService";
import { logger } from "#/lib/logger";
import type { meetingPreps } from "#/data/schema";

type MeetingPrep = typeof meetingPreps.$inferSelect;

/**
 * Service for AI-powered meeting preparation
 * Uses Claude to generate prep guides and handle chat interactions
 */
export class MeetingPrepService {
	/**
	 * Generate a prep guide for a meeting
	 * Uses Company Brain context to provide relevant, company-specific guidance
	 */
	static async generatePrepGuide(prep: MeetingPrep): Promise<string> {
		const anthropic = getAnthropicClient();

		// Load company context
		const companyContext = await CompanyAIContextService.loadCompanyContext(prep.companyId);
		const formattedContext = CompanyAIContextService.formatContextForPrompt(companyContext, prep.callType as CallType);

		const systemPrompt = `You are an expert sales coach helping a sales rep prepare for an important upcoming meeting. Your job is to create a comprehensive, actionable preparation guide.

Based on the meeting context and company knowledge provided, generate a prep guide that will help the rep succeed in this meeting.

## Company Knowledge Base
${formattedContext || "No company-specific context available yet."}

## Guidelines:
- Be specific and actionable, not generic
- Tailor advice to the call type and prospect context
- Include specific talking points, questions to ask, and objections to prepare for
- Draw on the company knowledge base when available
- Format your response in clear, readable markdown
- Include sections that are most relevant for THIS specific meeting
- Focus on what will help the rep succeed in their stated goal`;

		const userPrompt = `Please create a meeting preparation guide for the following upcoming meeting:

## Meeting Context
- **Prospect Company:** ${prep.prospectCompany}
- **Contact:** ${prep.prospectContactName ?? "Unknown"} ${prep.prospectContactRole ? `(${prep.prospectContactRole})` : ""}
- **Industry:** ${prep.prospectIndustry ?? "Unknown"}
- **Company Size:** ${prep.prospectCompanySize ?? "Unknown"}
- **Website:** ${prep.prospectWebsite ?? "Not provided"}

## Call Details
- **Call Type:** ${prep.callType.replace("_", " ")}
- **Goal:** ${prep.meetingGoal}
${prep.knownPainPoints?.length ? `- **Known Pain Points:** ${prep.knownPainPoints.join(", ")}` : ""}
${prep.previousInteractions ? `- **Previous Interactions:** ${prep.previousInteractions}` : ""}
${prep.notes ? `- **Additional Notes:** ${prep.notes}` : ""}

Generate a comprehensive prep guide that will help me succeed in this meeting and achieve my goal.`;

		logger.info({ prepId: prep.id, callType: prep.callType }, "Generating prep guide with Claude");

		const response = await anthropic.messages.create({
			model: ANTHROPIC_MODEL,
			max_tokens: 4096,
			messages: [
				{
					role: "user",
					content: userPrompt,
				},
			],
			system: systemPrompt,
		});

		const textContent = response.content.find((c) => c.type === "text");
		if (!textContent || textContent.type !== "text") {
			throw new Error("No text content in response");
		}

		logger.info({ prepId: prep.id, responseLength: textContent.text.length }, "Generated prep guide");

		return textContent.text;
	}

	/**
	 * Chat with prep context - streaming response
	 * Allows rep to ask follow-up questions about the meeting
	 */
	static async *chat(prep: MeetingPrep, message: string): AsyncGenerator<string> {
		const anthropic = getAnthropicClient();

		// Load company context
		const companyContext = await CompanyAIContextService.loadCompanyContext(prep.companyId);
		const formattedContext = CompanyAIContextService.formatContextForPrompt(companyContext, prep.callType as CallType);

		// Build chat history
		const chatHistory = (prep.chatHistory ?? []) as Array<{ role: "user" | "assistant"; content: string; timestamp: string }>;

		const systemPrompt = `You are an expert sales coach helping a sales rep prepare for an upcoming meeting. Answer their questions concisely and actionably.

## Company Knowledge Base
${formattedContext || "No company-specific context available yet."}

## Meeting Context
- **Prospect Company:** ${prep.prospectCompany}
- **Contact:** ${prep.prospectContactName ?? "Unknown"} ${prep.prospectContactRole ? `(${prep.prospectContactRole})` : ""}
- **Industry:** ${prep.prospectIndustry ?? "Unknown"}
- **Call Type:** ${prep.callType.replace("_", " ")}
- **Goal:** ${prep.meetingGoal}
${prep.knownPainPoints?.length ? `- **Known Pain Points:** ${prep.knownPainPoints.join(", ")}` : ""}
${prep.previousInteractions ? `- **Previous Interactions:** ${prep.previousInteractions}` : ""}

${prep.prepGuide ? `## Prep Guide Already Generated:\n${prep.prepGuide.slice(0, 2000)}${prep.prepGuide.length > 2000 ? "..." : ""}` : ""}

## Guidelines:
- Be concise and actionable
- Reference the company knowledge and meeting context
- Give specific, practical advice
- Use markdown formatting for clarity`;

		// Convert chat history to Claude format
		const messages = [
			...chatHistory.map((msg) => ({
				role: msg.role as "user" | "assistant",
				content: msg.content,
			})),
			{ role: "user" as const, content: message },
		];

		logger.info({ prepId: prep.id, historyLength: chatHistory.length }, "Starting chat stream");

		const stream = anthropic.messages.stream({
			model: ANTHROPIC_MODEL,
			max_tokens: 2048,
			messages,
			system: systemPrompt,
		});

		for await (const event of stream) {
			if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
				yield event.delta.text;
			}
		}
	}

	/**
	 * Generate roleplay persona for the meeting prospect
	 * Creates a realistic AI prospect based on the meeting context
	 */
	static async generateRoleplayPersona(prep: MeetingPrep): Promise<{ systemPrompt: string; firstMessage: string }> {
		const anthropic = getAnthropicClient();

		// Load company context for realistic objections
		const companyContext = await CompanyAIContextService.loadCompanyContext(prep.companyId);
		const formattedContext = CompanyAIContextService.formatContextForPrompt(companyContext, prep.callType as CallType);

		const metaPrompt = `You are creating a roleplay persona for sales training. Generate a realistic prospect persona based on this meeting context.

## Meeting Context
- **Prospect Company:** ${prep.prospectCompany}
- **Contact:** ${prep.prospectContactName ?? "Alex"}
- **Role:** ${prep.prospectContactRole ?? "Decision Maker"}
- **Industry:** ${prep.prospectIndustry ?? "Technology"}
- **Company Size:** ${prep.prospectCompanySize ?? "Mid-market"}
- **Call Type:** ${prep.callType.replace("_", " ")}
- **Rep's Goal:** ${prep.meetingGoal}
${prep.knownPainPoints?.length ? `- **Known Pain Points:** ${prep.knownPainPoints.join(", ")}` : ""}
${prep.previousInteractions ? `- **Previous Interactions:** ${prep.previousInteractions}` : ""}

## Company Knowledge (for realistic objections)
${formattedContext || "No company-specific context available."}

Generate a JSON response with:
1. "systemPrompt": A detailed system prompt for the AI to roleplay as this prospect. Include personality, communication style, concerns, and how they should respond to the rep's approach. Make them realistic but fair.
2. "firstMessage": A natural opening line from the prospect to start the roleplay conversation (e.g., "Hi, thanks for taking the time to meet. So tell me, what do you have for us today?")

The persona should:
- Be realistic for the role and industry
- Have relevant concerns based on the call type
- Push back on weak pitches but respond positively to good technique
- Not be unfairly difficult, but require genuine sales skill to succeed

Respond with valid JSON only.`;

		const response = await anthropic.messages.create({
			model: ANTHROPIC_MODEL,
			max_tokens: 2048,
			messages: [{ role: "user", content: metaPrompt }],
		});

		const textContent = response.content.find((c) => c.type === "text");
		if (!textContent || textContent.type !== "text") {
			throw new Error("No text content in response");
		}

		try {
			// Extract JSON from response (handle markdown code blocks)
			let jsonStr = textContent.text;
			const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (jsonMatch) {
				jsonStr = jsonMatch[1];
			}

			const persona = JSON.parse(jsonStr.trim());

			logger.info({ prepId: prep.id }, "Generated roleplay persona");

			return {
				systemPrompt: persona.systemPrompt,
				firstMessage: persona.firstMessage,
			};
		} catch {
			logger.error({ prepId: prep.id, response: textContent.text }, "Failed to parse persona JSON");

			// Fallback to a generic persona
			return {
				systemPrompt: `You are ${prep.prospectContactName ?? "Alex"}, a ${prep.prospectContactRole ?? "decision maker"} at ${prep.prospectCompany}. You are in a ${prep.callType.replace("_", " ")} call. You have real concerns about ${prep.knownPainPoints?.join(", ") ?? "budget and timeline"}. Be professional but require the rep to demonstrate value. Respond naturally and push back on weak arguments.`,
				firstMessage: `Hi there, thanks for connecting. So what did you want to discuss today?`,
			};
		}
	}
}
