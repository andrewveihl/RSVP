import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { newRowId, readRows } from '$lib/server/content-forms';
import { getSection, getSetting, logActivity, setSection, setSetting } from '$shared/db';
import { getConfig } from '$shared/config';
import { cleanText, safeUrl } from '$shared/sanitize';
import { DETAILS_ROWS } from '$shared/details';
import type { DetailsField } from '$shared/types';

export const load: PageServerLoad = () => ({
	details: getSection('details', getSetting('couple_names')),
	rows: DETAILS_ROWS,
	// The real wedding date, shown alongside the hand-written "When" line so the two
	// can be compared here rather than discovered to disagree on the live site.
	weddingDate: getSetting('wedding_date'),
	siteUrl: getConfig().siteUrl
});

export const actions: Actions = {
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const extras: DetailsField[] = readRows(result.form, 'extra', 20)
			.map((row, index) => ({
				id: row.id(newRowId('extra', index)),
				label: row.text('label', 80),
				value: row.multiline('value', 1000)
			}))
			.filter((extra) => extra.label && extra.value);

		const venueName = cleanText(result.form.get('venueName'), { max: 160 });
		const venueAddress = cleanText(result.form.get('venueAddress'), { multiline: true, max: 400 });

		// An unchecked checkbox submits nothing, so absence is what says "hide this row".
		const hiddenRows = DETAILS_ROWS.filter(
			(row) => result.form.get(`show_${row.id}`) !== '1'
		).map((row) => row.id);

		setSection('details', {
			heading: cleanText(result.form.get('heading'), { max: 120 }) || 'Event Details',
			dateLine: cleanText(result.form.get('dateLine'), { max: 160 }),
			timeLine: cleanText(result.form.get('timeLine'), { max: 160 }),
			venueName,
			venueAddress,
			// A non-http(s) link is dropped rather than saved: it is rendered as an
			// anchor on a public page.
			mapUrl: safeUrl(result.form.get('mapUrl')) ?? '',
			dressCode: cleanText(result.form.get('dressCode'), { multiline: true, max: 1000 }),
			parking: cleanText(result.form.get('parking'), { multiline: true, max: 1000 }),
			extras,
			hiddenRows
		});

		// Mirrored into settings because invitations and reminder emails read the venue
		// from there -- keeping them in step is the point of writing both.
		setSetting('venue_name', venueName);
		setSetting('venue_address', venueAddress);

		logActivity({
			eventType: 'content_changed',
			description: 'Edited the event details',
			ipAddress: event.locals.clientIp
		});

		return { success: 'Event details saved.' };
	}
};
