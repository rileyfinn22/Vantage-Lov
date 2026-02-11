/**
 * Central Configuration File
 *
 * All hardcoded values, magic numbers, and feature flags should be defined here.
 * This makes it easy to adjust behavior without searching through the codebase.
 */

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

export const SERVER = {
	/** Default port when PORT env var is not set */
	DEFAULT_PORT: 3030,

	/** Default PostgreSQL port */
	DEFAULT_PG_PORT: 5432,

	/** GCS project ID fallback */
	DEFAULT_GCS_PROJECT_ID: "vantage-471500",
} as const;

// =============================================================================
// TIMING & INTERVALS (all in milliseconds unless noted)
// =============================================================================

export const TIMING = {
	/** How long before a "processing" interaction is considered stale and recovered */
	STALE_INTERACTION_THRESHOLD_MS: 10 * 60 * 1000, // 10 minutes

	/** Startup delay before running background jobs */
	BACKGROUND_JOB_STARTUP_DELAY_MS: 5000,

	/** Interval between transcript processing job runs */
	TRANSCRIPT_JOB_INTERVAL_MS: 10000,

	/** Interval between rating/analysis job runs */
	RATING_JOB_INTERVAL_MS: 2000,

	/** Initial delay before first job run */
	INITIAL_JOB_DELAY_MS: 1000,

	/** Audio transcription timeout */
	TRANSCRIPTION_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes

	/** Presigned URL expiration (15 minutes in seconds) */
	PRESIGNED_URL_EXPIRATION_SECONDS: 15 * 60,

	/** Audio download URL expiration (1 hour in seconds) */
	AUDIO_URL_EXPIRATION_SECONDS: 3600,

	/** Cache-Control max-age for training audio */
	TRAINING_AUDIO_CACHE_MAX_AGE: 3600,
} as const;

// =============================================================================
// FILE UPLOAD LIMITS
// =============================================================================

export const FILE_LIMITS = {
	/** Maximum video file size (2GB) */
	MAX_VIDEO_SIZE_BYTES: 2 * 1024 * 1024 * 1024,

	/** Maximum audio file size (2GB) */
	MAX_AUDIO_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
} as const;

// =============================================================================
// AI / LLM CONFIGURATION
// =============================================================================

export const AI = {
	/** Default Anthropic model for analysis */
	DEFAULT_ANTHROPIC_MODEL: "claude-sonnet-4-20250514",

	/** Max tokens for different operations */
	MAX_TOKENS: {
		DEFAULT: 8192,
		FLAGGING: 16384, // Increased for detailed enterprise coaching flags
		CALIBRATION: 4096,
		BATTLE_CARD: 1024,
		BATTLE_CARD_GENERATION: 2048,
		ROLEPLAY_PERSONA: 16384,
		ROLEPLAY_FULL: 4096,
	},

	/** ElevenLabs configuration */
	ELEVENLABS: {
		BASE_URL: "https://api.elevenlabs.io/v1",
		/** Default voice ID - Roger (Laid-Back, Casual, Resonant - male) */
		DEFAULT_VOICE_ID: "CwhRBWXzGAHq8TQ4Fs17",
		/** Alternative default voice ID */
		ALT_VOICE_ID: "21m00Tcm4TlvDq8ikWAM",
		/** Audio output format for low latency streaming */
		AUDIO_OUTPUT_FORMAT: "pcm_16000",
	},

	/** Default voice ID for roleplay personas (from prompts) */
	ROLEPLAY_DEFAULT_VOICE_ID: "jason",

	/** Default model for roleplay (from prompts) */
	ROLEPLAY_DEFAULT_MODEL: "gemini-2.5-flash-lite",
} as const;

// =============================================================================
// AUDIO PROCESSING
// =============================================================================

export const AUDIO = {
	/** Standard audio frequency */
	STANDARD_FREQUENCY: 44100,

	/** High quality bitrate */
	HIGH_QUALITY_BITRATE: 320000,

	/** High quality sample rate */
	HIGH_QUALITY_SAMPLE_RATE: 48000,
} as const;

// =============================================================================
// PAGINATION & QUERY LIMITS
// =============================================================================

export const PAGINATION = {
	/** Default page size for paginated queries */
	DEFAULT_PAGE_SIZE: 10,

	/** Maximum page size allowed */
	MAX_PAGE_SIZE: 100,

	/** Maximum ID value for validation */
	MAX_ID_VALUE: 999999,

	/** Default limit for analytics queries */
	DEFAULT_ANALYTICS_LIMIT: 12,

	/** Sample limit for feedback aggregation */
	FEEDBACK_SAMPLE_LIMIT: 1000,
} as const;

// =============================================================================
// SCORING THRESHOLDS
// =============================================================================

export const THRESHOLDS = {
	/** Confidence thresholds for training recommendations */
	CONFIDENCE: {
		HIGH: 80,
		MEDIUM: 60,
	},

	/** Success rate thresholds for difficulty calculation */
	SUCCESS_RATE: {
		EASY: 80, // difficulty = 1
		MEDIUM_EASY: 60, // difficulty = 2
		MEDIUM: 40, // difficulty = 3
		MEDIUM_HARD: 20, // difficulty = 4
		// Below 20 = difficulty 5 (hardest)
	},

	/** High confidence for manual calibration */
	MANUAL_CALIBRATION_CONFIDENCE: "0.9000",
} as const;

// =============================================================================
// DEVELOPMENT / DEBUG
// =============================================================================

export const DEV = {
	/** Artificial delay settings for development/testing */
	DELAY: {
		SMALL: 10,
		MEDIUM: 50,
		LARGE: 100,
	},

	/** Test timeout for file operations */
	FILE_OPERATION_TIMEOUT_MS: 30000,

	/** Test pagination high page number */
	TEST_HIGH_PAGE: 9999,

	/** Test non-existent ID */
	TEST_NONEXISTENT_ID: 99999,
} as const;

// =============================================================================
// TRUSTED ORIGINS (for CORS/auth)
// =============================================================================

export const TRUSTED_LOCALHOST_PORTS = [5173, 3000, 5000, 5025] as const;

/**
 * Build trusted origins array for auth configuration
 */
export function buildTrustedOrigins(): string[] {
	const origins: string[] = [];

	// Add localhost variants for development
	if (process.env.NODE_ENV === "development") {
		for (const port of TRUSTED_LOCALHOST_PORTS) {
			origins.push(`https://localhost:${port}`);
			origins.push(`http://localhost:${port}`);
		}
	}

	// Add HOST-based origin if set
	if (process.env.HOST) {
		origins.push(`https://${process.env.HOST}`);
	}

	return origins;
}

// =============================================================================
// EXTERNAL SERVICE URLS
// =============================================================================

export const EXTERNAL_URLS = {
	/** SigNoz tracing endpoint */
	SIGNOZ_TRACES: "https://ingest.us.signoz.cloud:443/v1/traces",

	/** SigNoz logs endpoint */
	SIGNOZ_LOGS: "https://ingest.us.signoz.cloud:443/v1/logs",

	/** ElevenLabs speech-to-text endpoint */
	ELEVENLABS_STT: "https://api.elevenlabs.io/v1/speech-to-text",
} as const;

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export const FEATURES = {
	/** Enable async workflow orchestration for training session start */
	ASYNC_SESSION_START: process.env.ENABLE_ASYNC_SESSION_START === "true",
} as const;
