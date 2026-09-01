import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHousehold } from '$shared/db';
import { getConfig } from '$shared/config';
import { rsvpUrl } from '$shared/tokens';
import { qrDataUrl } from '$shared/qr';

/**
 * One household's QR code, as a data URL, for the live invitation preview.
 *
 * A data URL rather than an image response so it can be inlined straight into the
 * preview's SVG -- an `<image href>` pointing at another route would be a second
 * request per redraw, and the admin CSP already allows `data:` images for exactly this.
 *
 * Small and cacheable: the code depends only on the token, which changes only when the
 * link is deliberately rotated.
 */
export const GET: RequestHandler = async ({ url, locals, setHeaders }) => {
	if (!locals.admin) error(401, 'Not signed in.');

	const household = getHousehold(url.searchParams.get('household') ?? '');
	if (!household) error(404, 'No such household.');

	setHeaders({ 'cache-control': 'no-store' });

	return json({
		dataUrl: await qrDataUrl(rsvpUrl(getConfig().siteUrl, household.token), { size: 320 })
	});
};
