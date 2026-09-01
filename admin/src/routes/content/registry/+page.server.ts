import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { newRowId, readRows } from '$lib/server/content-forms';
import { getSection, getSetting, logActivity, setSection } from '$shared/db';
import { getConfig } from '$shared/config';
import { cleanText } from '$shared/sanitize';
import type { RegistryLink } from '$shared/types';

export const load: PageServerLoad = () => ({
	registry: getSection('registry', getSetting('couple_names')),
	siteUrl: getConfig().siteUrl
});

export const actions: Actions = {
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const links: RegistryLink[] = readRows(result.form, 'link', 30)
			.map((row, index) => ({
				id: row.id(newRowId('link', index)),
				name: row.text('name', 120),
				// `row.url` returns '' for anything that is not http(s), so a mistyped
				// entry drops out below rather than rendering as a dead or hostile link.
				url: row.url('url'),
				description: row.text('description', 200)
			}))
			.filter((link) => link.name && link.url);

		setSection('registry', {
			heading: cleanText(result.form.get('heading'), { max: 120 }) || 'Registry',
			intro: cleanText(result.form.get('intro'), { multiline: true, max: 600 }),
			links
		});

		logActivity({
			eventType: 'content_changed',
			description: `Edited the registry (${links.length} link(s))`,
			ipAddress: event.locals.clientIp
		});

		return { success: 'Registry saved.' };
	}
};
