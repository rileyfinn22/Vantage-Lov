import type { ToolDefinition, JsonValue } from "#/agentic/types";
import { runCalibration } from "#/services/CalibrationService";

export function getCalibrationTools(): ToolDefinition[] {
	const tools: ToolDefinition[] = [
		{
			name: "run_calibration",
			description: "Run company calibration to extract patterns from provided good/average/bad example calls.",
			inputSchema: {
				type: "object",
				properties: {
					companyId: { type: "number" },
					goodCall: { type: "string" },
					averageCall: { type: "string" },
					badCall: { type: "string" },
				},
				required: ["companyId"],
			},
			handler: async (args: any): Promise<JsonValue> => {
				return (await runCalibration({
					companyId: Number(args.companyId),
					goodCall: args.goodCall ? String(args.goodCall) : undefined,
					averageCall: args.averageCall ? String(args.averageCall) : undefined,
					badCall: args.badCall ? String(args.badCall) : undefined,
				})) as any;
			},
		},
	];

	return tools;
}
