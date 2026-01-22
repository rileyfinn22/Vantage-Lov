import { z } from "zod";

export const TranscriptionSegmentSchema = z.object({
	text: z.string(),
	speakerId: z.string(),
	startTime: z.number(),
	endTime: z.number(),
	confidence: z.number().min(0).max(1),
});

export const TranscriptionResultSchema = z.object({
	segments: z.array(TranscriptionSegmentSchema),
	durationSeconds: z.number(),
	speakerCount: z.number(),
	processingTimeMs: z.number(),
	service: z.string(),
});

export type TranscriptionSegment = z.infer<typeof TranscriptionSegmentSchema>;
export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>;

export function validateTranscriptionResult(data: unknown): TranscriptionResult {
	return TranscriptionResultSchema.parse(data);
}
