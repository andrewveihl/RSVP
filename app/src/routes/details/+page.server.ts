import type { PageServerLoad } from './$types';
import { requireSection } from '$lib/server/site';
import { safeUrl } from '$shared/sanitize';

export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	requireSection(site.content, 'details');

	// The map link is re-checked on the way out, not just on the way in: a row written
	// by an older build, or edited directly in the database, must not become a
	// `javascript:` anchor on a public page.
	return { mapUrl: safeUrl(site.content.details.mapUrl) };
};
