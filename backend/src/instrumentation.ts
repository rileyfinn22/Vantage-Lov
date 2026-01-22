/**
 * OpenTelemetry Instrumentation for Signoz
 *
 * This file MUST be imported first, before any other application code.
 * It initializes the OpenTelemetry SDK with Signoz tracing and logging.
 *
 * Environment variables required:
 * - SIGNOZ_KEY
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { ConsoleLogRecordExporter, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
// import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';

// For troubleshooting, set the log level to DiagLogLevel.DEBUG
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

// Only initialize if Signoz credentials are present
const { SIGNOZ_KEY } = process.env;
let _inited = false;

if (SIGNOZ_KEY) {
	// Object.entries(process.env).filter(([k, v]) => {
	//   if(k.startsWith("OT")) {
	//     console.log(`${k}: ${v}`)
	//   }
	// })

	_inited = true;
	// Enable diagnostic logging BEFORE initializing any instrumentation
	// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
	const sdk = new NodeSDK({
		serviceName: "vantage-monolith",
		traceExporter: new OTLPTraceExporter({
			// optional - default url is http://localhost:4318/v1/traces
			url: "https://ingest.us.signoz.cloud:443/v1/traces", // url is optional and can be omitted
			headers: {
				"signoz-ingestion-key": SIGNOZ_KEY,
			}, // an optional object containing custom headers to be sent with each request
		}),
		logRecordProcessors: [
			new SimpleLogRecordProcessor(
				new OTLPLogExporter({
					url: "https://ingest.us.signoz.cloud:443/v1/logs",
					headers: {
						"signoz-ingestion-key": SIGNOZ_KEY,
					},
				}),
			),
			new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
		],
		instrumentations: [
			getNodeAutoInstrumentations(),
			new PinoInstrumentation({
				// Log correlation: adds trace_id, span_id, trace_flags to logs
				// Log sending: sends logs to OpenTelemetry SDK
				// Both are enabled by default
			}),
		],
		resource: resourceFromAttributes({
			// highlight-next-line
			[SemanticResourceAttributes.SERVICE_NAME]: "vantage-monolith",
			"tenant.name": process.env.TENANT_NAME,
		}),
	});

	sdk.start();

	console.log("OpenTelemetry + Signoz tracing and logging initialized");

	// Graceful shutdown
	process.on("SIGTERM", () => {
		sdk
			.shutdown()
			.then(() => console.info("OpenTelemetry SDK shut down successfully"))
			.catch((error) => console.error({ error }, "Error shutting down OpenTelemetry SDK"));
	});
} else {
	console.log("Signoz credentials not found - tracing and logging disabled");
}
