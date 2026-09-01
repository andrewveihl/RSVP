import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { newRowId, readRows } from '$lib/server/content-forms';
import { storeUpload } from '$lib/server/image-upload';
import { deleteImage, getSection, getSetting, logActivity, setSection } from '$shared/db';
import { getConfig } from '$shared/config';
import { cleanText } from '$shared/sanitize';
import type { StoryMilestone } from '$shared/types';

export const load: PageServerLoad = () => ({
	story: getSection('story', getSetting('couple_names')),
	siteUrl: getConfig().siteUrl
});

export const actions: Actions = {
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const previous = getSection('story');
		const rows = readRows(result.form, 'milestone', 60);

		const milestones: StoryMilestone[] = [];
		for (const [index, row] of rows.entries()) {
			const id = row.id(newRowId('milestone', index));
			const existing = previous.milestones.find((milestone) => milestone.id === id);

			// A per-row file input, so one save can add photos to several milestones.
			const upload = await storeUpload(result.form.get(`milestone_${index}_image`), 'story');
			if (upload.error) return fail(400, { error: upload.error });

			const removing = result.form.get(`milestone_${index}_removeImage`) === '1';
			let imageId = upload.image?.id ?? existing?.imageId ?? null;

			if (upload.image && existing?.imageId) deleteImage(existing.imageId);
			if (removing && !upload.image) {
				if (existing?.imageId) deleteImage(existing.imageId);
				imageId = null;
			}

			const title = row.text('title', 160);
			// A row with no title and no text is one the admin emptied out; drop it
			// rather than publishing a blank milestone.
			if (!title && !row.multiline('description')) {
				if (existing?.imageId) deleteImage(existing.imageId);
				continue;
			}

			milestones.push({
				id,
				date: row.text('date', 80),
				title,
				description: row.multiline('description', 2000),
				imageId
			});
		}

		setSection('story', {
			heading: cleanText(result.form.get('heading'), { max: 120 }) || 'Our Story',
			milestones,
			narrative: cleanText(result.form.get('narrative'), { multiline: true, max: 10_000 })
		});

		logActivity({
			eventType: 'content_changed',
			description: `Edited Our Story (${milestones.length} milestone(s))`,
			ipAddress: event.locals.clientIp
		});

		return { success: 'Our Story saved.' };
	}
};
