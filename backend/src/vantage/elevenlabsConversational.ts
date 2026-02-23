import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { AI } from "#/config";

class ElevenLabsConversational {
	#client: ElevenLabsClient;

	constructor() {
		const apiKey = process.env.ELEVENLABS_API_KEY;
		if (!apiKey) {
			throw new Error("ELEVENLABS_API_KEY is not set");
		}
		this.#client = new ElevenLabsClient({ apiKey });
	}

	/**
	 * Get a signed URL to start a conversation with an agent that requires authorization
	 * @param agentId - The ID of the agent to converse with
	 * @param includeConversationId - Whether to include the conversation ID in the response
	 * @returns Object containing the signed URL and optionally the conversation ID
	 */
	async getSignedUrl(agentId: string, includeConversationId = false): Promise<ElevenLabs.ConversationSignedUrlResponseModel> {
		const response = await this.#client.conversationalAi.conversations.getSignedUrl({
			agentId,
			includeConversationId,
		});
		return response;
	}

	/**
	 * Create a training agent for sales practice scenarios
	 * @param systemPrompt - The system instruction prompt for the agent
	 * @param firstMessage - The initial message the agent should send
	 * @param voiceId - Optional voice ID (defaults to env var or default voice)
	 * @returns Object containing the created agent ID
	 */
	async createTrainingAgent(systemPrompt: string, firstMessage: string, voiceId?: string): Promise<{ agentId: string }> {
		const voice = voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? AI.ELEVENLABS.DEFAULT_VOICE_ID;

		const agent = await this.#client.conversationalAi.agents.create({
			conversationConfig: {
				agent: {
					prompt: {
						prompt: systemPrompt,
						// Use Gemini 2.5 Flash Lite for fastest response times
						llm: "gemini-2.5-flash-lite",
					},
					firstMessage,
					language: "en",
				},
				conversation: {
					maxDurationSeconds: 900, // 15 minutes
				},
				tts: {
					voiceId: voice,
					modelId: "eleven_flash_v2",
					// Optimize for lowest latency (4 = maximum latency optimization)
					optimizeStreamingLatency: 4,
					// Use pcm_16000 format for lower latency streaming
					agentOutputAudioFormat: AI.ELEVENLABS.AUDIO_OUTPUT_FORMAT,
				},
			},
		});

		return { agentId: agent.agentId };
	}

	/**
	 * Get the audio recording of a conversation
	 * @param conversationId - The ID of the conversation
	 * @returns Readable stream of audio data
	 */
	async getConversationAudio(conversationId: string): Promise<ReadableStream<Uint8Array>> {
		const response = await this.#client.conversationalAi.conversations.audio.get(conversationId);
		return response;
	}
}

// Lazy initialization to prevent crashes when ELEVENLABS_API_KEY is missing
let instance: ElevenLabsConversational | null = null;

function getInstance(): ElevenLabsConversational {
	if (!instance) {
		instance = new ElevenLabsConversational();
	}
	return instance;
}

export default {
	getSignedUrl: async (agentId: string, includeConversationId = false): Promise<ElevenLabs.ConversationSignedUrlResponseModel> => {
		return getInstance().getSignedUrl(agentId, includeConversationId);
	},

	createTrainingAgent: async (systemPrompt: string, firstMessage: string, voiceId?: string): Promise<{ agentId: string }> => {
		return getInstance().createTrainingAgent(systemPrompt, firstMessage, voiceId);
	},

	/**
	 * Get the audio recording of a conversation
	 * @param conversationId - The ID of the conversation
	 * @returns Readable stream of audio data
	 */
	getConversationAudio: async (conversationId: string): Promise<ReadableStream<Uint8Array>> => {
		return getInstance().getConversationAudio(conversationId);
	},
};
