import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { newRowId, readRows } from '$lib/server/content-forms';
import { storeUpload } from '$lib/server/image-upload';
import { deleteImage, getSection, getSetting, logActivity, setSection } from '$shared/db';
import { getConfig } from '$shared/config';
import { cleanText } from '$shared/sanitize';
import type { PartyMember } from '$shared/types';

export const load: PageServerLoad = () => ({
	party: getSection('party', getSetting('couple_names')),
	siteUrl: getConfig().siteUrl
});

export const actions: Actions = {
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const previous = getSection('party');
		const rows = readRows(result.form, 'member', 40);
		const members: PartyMember[] = [];

		for (const [index, row] of rows.entries()) {
			const id = row.id(newRowId('member', index));
			const existing = previous.members.find((member) => member.id === id);

			const upload = await storeUpload(result.form.get(`member_${index}_image`), 'party');
			if (upload.error) return fail(400, { error: upload.error });

			const removing = result.form.get(`member_${index}_removeImage`) === '1';
			let imageId = upload.image?.id ?? existing?.imageId ?? null;

			if (upload.image && existing?.imageId) deleteImage(existing.imageId);
			if (removing && !upload.image) {
				if (existing?.imageId) deleteImage(existing.imageId);
				imageId = null;
			}

			const name = row.text('name', 120);
			// A member is their name; without one there is nothing to show on a card.
			if (!name) {
				if (existing?.imageId) deleteImage(existing.imageId);
				continue;
			}

			members.push({
				id,
				name,
				role: row.text('role', 80),
				bio: row.multiline('bio', 1000),
				imageId
			});
		}

		setSection('party', {
			heading: cleanText(result.form.get('heading'), { max: 120 }) || 'Wedding Party',
			intro: cleanText(result.form.get('intro'), { multiline: true, max: 600 }),
			members
		});

		logActivity({
			eventType: 'content_changed',
			description: `Edited the wedding party (${members.length} member(s))`,
			ipAddress: event.locals.clientIp
		});

		return { success: 'Wedding party saved.' };
	}
};
