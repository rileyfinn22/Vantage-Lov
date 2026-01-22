import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const isBundledEnv = "Bun" in globalThis;

// Create logger with fallback for environments without pino transports
function createLogger() {
	// In bundled environments, use simple pino without transports
	if (isBundledEnv) {
		return pino({ level: process.env.LOG_LEVEL ?? "info" });
	}

	// Try to use pino transports, fall back to basic pino if they're not available
	try {
		const otelTransport = pino.transport({
			targets: [
				{ target: "pino-opentelemetry-transport" },
				!isProduction ? { target: "pino-pretty" } : { target: "pino/file", options: { destination: 1 } },
			],
		});
		return pino(otelTransport);
	} catch {
		// Fallback to basic pino if transports aren't available
		return pino({ level: process.env.LOG_LEVEL ?? "info" });
	}
}

export const logger = createLogger();

export default logger;
