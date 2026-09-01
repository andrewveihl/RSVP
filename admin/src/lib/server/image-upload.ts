/**
 * Shared handling for the image uploads scattered across the content editor.
 *
 * Every section that accepts a photo -- hero, milestones, party members, gallery --
 * funnels through here, so the size cap, the magic-byte check and the error wording are
 * identical everywhere rather than reimplemented four times with three different limits.
 */
import { ImageRejected, MAX_IMAGE_BYTES, deleteImage, storeImage } from '$shared/db';
import { logError } from '$shared/logger';
import type { SiteImage } from '$shared/types';

export interface UploadOutcome {
	image: SiteImage | null;
	error: string | null;
}

/**
 * Stores an uploaded file, if there is one.
 *
 * An absent or empty file is not an error: most saves of the hero section do not
 * replace the photo, and the form submits an empty file input regardless.
 */
export async function storeUpload(value: FormDataEntryValue | null, section: string): Promise<UploadOutcome> {
	if (!(value instanceof File) || value.size === 0) return { image: null, error: null };

	if (value.size > MAX_IMAGE_BYTES) {
		return {
			image: null,
			error: `That image is ${(value.size / 1024 / 1024).toFixed(1)}MB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`
		};
	}

	try {
		const data = Buffer.from(await value.arrayBuffer());
		return { image: storeImage({ section, filename: value.name, data }), error: null };
	} catch (error) {
		if (error instanceof ImageRejected) return { image: null, error: error.message };
		logError('Image upload failed', error, { section });
		return { image: null, error: 'That image could not be saved.' };
	}
}

/**
 * Replaces one image with another, deleting the old row.
 *
 * The delete happens only once the new image is safely stored: a failed upload that had
 * already removed the old photo would leave the section with nothing.
 */
export async function replaceImage(
	value: FormDataEntryValue | null,
	section: string,
	previousId: string | null
): Promise<UploadOutcome> {
	const outcome = await storeUpload(value, section);
	if (outcome.image && previousId) deleteImage(previousId);
	return outcome;
}
