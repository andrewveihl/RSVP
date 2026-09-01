import type { PageServerLoad } from './$types';
import { listHouseholds, getSetting } from '$shared/db';
import { CARD_PRESETS } from '$shared/invitations';
import { invitationDetails } from '$lib/server/invitation-details';

export const load: PageServerLoad = ({ url }) => {
	// The guests page links here with a pre-made selection, so a batch flows straight
	// from "these fifty" to "one PDF of these fifty".
	const preselected = (url.searchParams.get('ids') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	return {
		households: listHouseholds({ sort: 'name' }),
		preselected,
		presets: Object.entries(CARD_PRESETS).map(([key, preset]) => ({ key, ...preset })),
		defaults: {
			width: getSetting('invitation_width_in'),
			height: getSetting('invitation_height_in')
		},
		details: invitationDetails()
	};
};
