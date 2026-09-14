import type { PageServerLoad } from './$types';
import { requireSection } from '$lib/server/site';
import { visiblePartyMembers } from '$shared/party';

export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	requireSection(site.content, 'party');

	// Normalised here rather than trusted in the markup. A member missing a field used
	// to throw during hydration and take the whole page down -- see `$shared/party`.
	return { members: visiblePartyMembers(site.content.party) };
};
