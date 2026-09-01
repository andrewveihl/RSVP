import type { PageServerLoad } from './$types';
import { requireSection } from '$lib/server/site';
import { paragraphsToHtml } from '$shared/sanitize';

export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	requireSection(site.content, 'story');

	return {
		// The narrative is stored as plain text the couple typed; turning it into
		// paragraphs on the server keeps `{@html}` on the page fed by an escaped,
		// server-generated string rather than by anything a request could influence.
		narrativeHtml: paragraphsToHtml(site.content.story.narrative)
	};
};
