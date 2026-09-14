import type { PageServerLoad } from './$types';
import { requireSection } from '$lib/server/site';
import { asImageId, asRows, asText } from '$shared/content-rows';
import { paragraphsToHtml } from '$shared/sanitize';

export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	requireSection(site.content, 'story');

	const story = site.content.story;

	// Normalised here rather than trusted in the markup. The timeline is keyed on
	// `milestone.id`, so a null in this array is read before anything renders and takes
	// the page down with it -- see `$shared/content-rows`.
	const milestones = asRows(story.milestones)
		.map((milestone, index) => ({
			id: asText(milestone.id) || `milestone-${index}`,
			date: asText(milestone.date),
			title: asText(milestone.title),
			description: asText(milestone.description),
			imageId: asImageId(milestone.imageId)
		}))
		// A milestone with nothing in it draws a dot on the line and no story beside it.
		.filter((milestone) => milestone.title || milestone.description || milestone.date);

	return {
		milestones,
		// The narrative is stored as plain text the couple typed; turning it into
		// paragraphs on the server keeps `{@html}` on the page fed by an escaped,
		// server-generated string rather than by anything a request could influence.
		narrativeHtml: paragraphsToHtml(asText(story.narrative))
	};
};
