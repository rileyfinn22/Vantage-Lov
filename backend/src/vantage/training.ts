import { db, computeRawInteractionText } from "#/data";
import * as schema from "#/data/schema";
import { eq } from "drizzle-orm";
import { salesPersonData } from "#/api/salespeople/routes";

export async function flagDetailsData(flagId: number) {
	// Get the flag by ID
	const flagResult = await db.select().from(schema.flags).where(eq(schema.flags.id, flagId));

	if (flagResult.length === 0) {
		return null;
	}

	const flag = flagResult[0];

	// Get related interaction if exists
	let interaction = null;
	let interactionFlags: (typeof schema.flags.$inferSelect)[] = [];
	if (flag.interactionId) {
		const interactionResult = await db.select().from(schema.interactions).where(eq(schema.interactions.id, flag.interactionId));
		const rawInteraction = interactionResult[0];
		// Add computed rawInteractionText for backward compatibility
		interaction = rawInteraction
			? {
					...rawInteraction,
					rawInteractionText: computeRawInteractionText(rawInteraction),
				}
			: null;

		// Get all flags for this interaction (for displaying markers on audio player)
		interactionFlags = await db.select().from(schema.flags).where(eq(schema.flags.interactionId, flag.interactionId));
	}

	// Get audio file for the interaction if exists
	let audioFile = null;
	if (flag.interactionId) {
		const audioMimeTypes = ["audio/mpeg", "audio/wav", "audio/mp3", "video/mp4", "video/webm", "video/quicktime"];
		const audioFileResult = await db.select().from(schema.bigfiles).where(eq(schema.bigfiles.interactionId, flag.interactionId));

		// Filter for audio/video files and take the first one
		const audioFiles = audioFileResult.filter((file) => file.mimeType && audioMimeTypes.includes(file.mimeType));
		audioFile = audioFiles.length > 0 ? audioFiles[0] : null;
	}

	// Get full salesperson details using existing function
	const salespersonDetails = await salesPersonData({ salespersonId: flag.associatedSalespersonId });

	if (!salespersonDetails) {
		throw new Error("Associated salesperson not found");
	}

	return {
		flag,
		interaction,
		audioFile,
		interactionFlags,
		salesperson: salespersonDetails,
	};
}
