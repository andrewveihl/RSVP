import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { asImageId, asRows, asText } from '$shared/content-rows';
import { guard, isGuardFailure } from '$lib/server/guard';
import { newRowId, readRows } from '$lib/server/content-forms';
import { storeUpload } from '$lib/server/image-upload';
import { deleteImage, getSection, getSetting, logActivity, setSection } from '$shared/db';
import { getConfig } from '$shared/config';
import { cleanText } from '$shared/sanitize';
import type { PartyMember } from '$shared/types';

export const load: PageServerLoad = () => {
	const party = getSection('party', getSetting('couple_names'));

	return {
		party: {
			...party,
			// Normalised before the editor clones it into state. The list is keyed on
			// the member's id, so a null in this array throws before anything renders --
			// and this is the screen somebody would come to in order to fix that.
			members: asRows(party.members).map((member, index) => ({
				id: asText(member.id) || `member-${index}`,
				name: asText(member.name),
				role: asText(member.role),
				group: asText(member.group),
				bio: asText(member.bio),
				imageId: asImageId(member.imageId)
			}))
		},
		siteUrl: getConfig().siteUrl
	};
};

export const actions: Actions = {
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const previous = getSection('party');
		const rows = readRows(result.form, 'member', 40);
		const members: PartyMember[] = [];

		for (const row of rows) {
			// `row.index` is where this row sat in the *form*, which is not where it sits
			// in `rows`: a member removed in the browser leaves a gap, and the gap is
			// skipped. Using the array position here would read the next member's photo
			// -- or nothing at all, which is one of the ways a photo appeared not to
			// upload when it had.
			const id = row.id(newRowId('member', row.index));
			const existing = previous.members.find((member) => member.id === id);

			const upload = await storeUpload(result.form.get(`member_${row.index}_image`), 'party');
			if (upload.error) return fail(400, { error: upload.error });

			const removing = result.form.get(`member_${row.index}_removeImage`) === '1';
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
				group: row.text('group', 60),
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
