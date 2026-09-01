import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { newRowId, readRows } from '$lib/server/content-forms';
import { getSection, getSetting, logActivity, setSection } from '$shared/db';
import { getConfig } from '$shared/config';
import { defaultSiteContent } from '$shared/defaults';
import { cleanText } from '$shared/sanitize';
import type { FaqItem } from '$shared/types';

export const load: PageServerLoad = () => ({
	faq: getSection('faq', getSetting('couple_names')),
	// Offered as one-click additions, so the standard questions are never retyped.
	templates: defaultSiteContent().faq.items,
	siteUrl: getConfig().siteUrl
});

export const actions: Actions = {
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const items: FaqItem[] = readRows(result.form, 'faq', 60)
			.map((row, index) => ({
				id: row.id(newRowId('faq', index)),
				question: row.text('question', 300),
				answer: row.multiline('answer', 3000)
			}))
			.filter((item) => item.question && item.answer);

		setSection('faq', {
			heading: cleanText(result.form.get('heading'), { max: 120 }) || 'Questions',
			intro: cleanText(result.form.get('intro'), { multiline: true, max: 600 }),
			items
		});

		logActivity({
			eventType: 'content_changed',
			description: `Edited the FAQ (${items.length} question(s))`,
			ipAddress: event.locals.clientIp
		});

		return { success: 'FAQ saved.' };
	}
};
