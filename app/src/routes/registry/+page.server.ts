import type { PageServerLoad } from './$types';
import { requireSection } from '$lib/server/site';
import { safeUrl } from '$shared/sanitize';

export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	requireSection(site.content, 'registry');

	// Re-validated here so a stored link can only ever render as http(s).
	const links = site.content.registry.links
		.map((link) => ({ ...link, url: safeUrl(link.url) }))
		.filter((link): link is typeof link & { url: string } => link.url !== null);

	return { links };
};
