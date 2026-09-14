import type { PageServerLoad } from './$types';
import { requireSection } from '$lib/server/site';
import { asRows, asText } from '$shared/content-rows';
import { safeUrl } from '$shared/sanitize';

export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	requireSection(site.content, 'registry');

	// Re-validated here so a stored link can only ever render as http(s), and read
	// through `asRows` so a null in the array cannot throw on the way -- reading
	// `link.url` off one is enough to take the page down. See `$shared/content-rows`.
	const links = asRows(site.content.registry.links)
		.map((link, index) => ({
			id: asText(link.id) || `link-${index}`,
			name: asText(link.name),
			description: asText(link.description),
			url: safeUrl(link.url)
		}))
		.filter((link): link is typeof link & { url: string } => link.url !== null);

	return { links };
};
