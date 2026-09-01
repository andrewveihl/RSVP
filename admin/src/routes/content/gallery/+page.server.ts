import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { storeUpload } from '$lib/server/image-upload';
import {
	deleteImage,
	getSection,
	getSetting,
	listImages,
	logActivity,
	reorderImages,
	setSection
} from '$shared/db';
import { getConfig } from '$shared/config';
import { cleanText, safeUrl } from '$shared/sanitize';

export const load: PageServerLoad = () => ({
	gallery: getSection('gallery', getSetting('couple_names')),
	images: listImages('gallery'),
	siteUrl: getConfig().siteUrl
});

export const actions: Actions = {
	saveText: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		setSection('gallery', {
			heading: cleanText(result.form.get('heading'), { max: 120 }) || 'Photos',
			intro: cleanText(result.form.get('intro'), { multiline: true, max: 600 }),
			uploaderUrl: safeUrl(result.form.get('uploaderUrl')) ?? '',
			uploaderNote: cleanText(result.form.get('uploaderNote'), { max: 300 })
		});

		logActivity({
			eventType: 'content_changed',
			description: 'Edited the photo page',
			ipAddress: event.locals.clientIp
		});

		return { success: 'Photo page saved.' };
	},

	upload: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const files = result.form.getAll('images');
		let stored = 0;
		const errors: string[] = [];

		for (const file of files) {
			const outcome = await storeUpload(file, 'gallery');
			if (outcome.error) errors.push(outcome.error);
			if (outcome.image) stored += 1;
		}

		if (stored === 0) {
			return fail(400, { error: errors[0] ?? 'Choose at least one image to upload.' });
		}

		logActivity({
			eventType: 'content_changed',
			description: `Added ${stored} photo(s) to the gallery`,
			ipAddress: event.locals.clientIp
		});

		return {
			success: `Added ${stored} photo(s).`,
			// Partial success is reported rather than swallowed: uploading eight photos
			// and getting seven should say so.
			warning: errors.length > 0 ? `${errors.length} skipped: ${errors[0]}` : undefined
		};
	},

	remove: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const id = result.form.get('id')?.toString() ?? '';
		if (!deleteImage(id)) return fail(404, { error: 'That photo is already gone.' });

		return { success: 'Photo removed.' };
	},

	reorder: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const ids = result.form.getAll('order').map((value) => value.toString());
		if (ids.length === 0) return fail(400, { error: 'Nothing to reorder.' });

		reorderImages(ids);
		return { success: 'Order saved.' };
	}
};
