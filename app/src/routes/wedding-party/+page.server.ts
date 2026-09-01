import type { PageServerLoad } from './$types';
import { requireSection } from '$lib/server/site';

export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	requireSection(site.content, 'party');
	return {};
};
