import type { PageServerLoad } from './$types';
import { requireSection } from '$lib/server/site';
import { asRows, asText } from '$shared/content-rows';

export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	requireSection(site.content, 'faq');

	// Normalised here rather than trusted in the markup. The accordion is keyed on
	// `item.id`, so a null in this array is read before anything renders and takes the
	// page down with it -- see `$shared/content-rows`.
	const items = asRows(site.content.faq.items)
		.map((item, index) => ({
			id: asText(item.id) || `faq-${index}`,
			question: asText(item.question),
			answer: asText(item.answer)
		}))
		// Without a question there is nothing to click on, only a stray answer.
		.filter((item) => item.question.trim() !== '');

	return { items };
};
