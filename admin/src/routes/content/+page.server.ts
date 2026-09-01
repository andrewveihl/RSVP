import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { replaceImage } from '$lib/server/image-upload';
import { deleteImage, getSection, getSetting, logActivity, setSection } from '$shared/db';
import { getConfig } from '$shared/config';
import { cleanText } from '$shared/sanitize';
import type { SectionToggles } from '$shared/types';

export const load: PageServerLoad = () => {
	const coupleNames = getSetting('couple_names');

	return {
		hero: getSection('hero', coupleNames),
		sections: getSection('sections', coupleNames),
		announcement: getSection('announcement', coupleNames),
		siteUrl: getConfig().siteUrl
	};
};

export const actions: Actions = {
	saveHero: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const current = getSection('hero');
		const removeImage = result.form.get('removeImage') === '1';

		const upload = await replaceImage(
			result.form.get('image'),
			'hero',
			// Only delete the old image when a new one replaced it; the explicit remove
			// path below handles the other case.
			removeImage ? null : current.imageId
		);
		if (upload.error) return fail(400, { error: upload.error });

		let imageId = upload.image?.id ?? current.imageId;
		if (removeImage && !upload.image) {
			if (current.imageId) deleteImage(current.imageId);
			imageId = null;
		}

		setSection('hero', {
			title: cleanText(result.form.get('title'), { max: 120 }),
			subtitle: cleanText(result.form.get('subtitle'), { max: 160 }),
			dateLine: cleanText(result.form.get('dateLine'), { max: 120 }),
			imageId
		});

		logActivity({
			eventType: 'content_changed',
			description: 'Edited the home page',
			ipAddress: event.locals.clientIp
		});

		return { success: 'Home page saved.' };
	},

	saveSections: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		// An unchecked checkbox submits nothing, so absence is the "off" signal.
		const on = (key: keyof SectionToggles) => result.form.get(`section_${key}`) === '1';
		const sections: SectionToggles = {
			story: on('story'),
			details: on('details'),
			party: on('party'),
			gallery: on('gallery'),
			registry: on('registry'),
			faq: on('faq'),
			countdown: on('countdown')
		};

		setSection('sections', sections);
		setSection('announcement', cleanText(result.form.get('announcement'), { max: 300 }));

		logActivity({
			eventType: 'content_changed',
			description: 'Changed which sections the site shows',
			metadata: { ...sections },
			ipAddress: event.locals.clientIp
		});

		return { success: 'Sections saved.' };
	}
};
