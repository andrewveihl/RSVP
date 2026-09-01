import type { PageServerLoad } from './$types';
import { listHouseholds } from '$shared/db';
import { LABEL_LAYOUTS } from '$shared/labels';

export const load: PageServerLoad = ({ url }) => {
	const preselected = (url.searchParams.get('ids') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	const households = listHouseholds({ sort: 'name' });

	return {
		households,
		preselected,
		// Surfaced so the admin can see at a glance who would print as a bare name.
		missingAddresses: households.filter((household) => !household.mailingAddress?.trim()).length,
		sheets: Object.entries(LABEL_LAYOUTS).map(([key, layout]) => ({
			key,
			label: layout.label,
			perSheet: layout.columns * layout.rows
		}))
	};
};
