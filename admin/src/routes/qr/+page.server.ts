import type { PageServerLoad } from './$types';
import { listHouseholds } from '$shared/db';
import { getConfig } from '$shared/config';
import { lookupUrl } from '$shared/tokens';
import { qrDataUrl } from '$shared/qr';

export const load: PageServerLoad = async () => {
	const universal = lookupUrl(getConfig().siteUrl);

	return {
		households: listHouseholds({ sort: 'name' }).map((household) => ({
			id: household.id,
			name: household.name
		})),
		universal,
		// Only the universal code is rendered on the page. Drawing a preview for every
		// household would mean generating hundreds of PNGs for a screen whose real job
		// is handing out download links.
		universalQr: await qrDataUrl(universal, { size: 420 })
	};
};
