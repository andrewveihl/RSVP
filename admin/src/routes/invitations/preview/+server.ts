import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHousehold, listHouseholds } from '$shared/db';
import { buildSingleInvitation, CARD_PRESETS } from '$shared/invitations';
import { clampInteger } from '$shared/sanitize';
import { invitationDetails } from '$lib/server/invitation-details';

/**
 * A one-card preview, served inline so it opens in the browser's PDF viewer rather
 * than downloading.
 *
 * GET, and read-only: nothing here changes state, so it needs no CSRF token and can be
 * a plain link the admin opens in a new tab.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.admin) error(401, 'Not signed in.');

	const requested = url.searchParams.get('household');
	// Falling back to the first household means the preview works before anyone has
	// picked a specific one.
	const household = requested ? getHousehold(requested) : (listHouseholds({ limit: 1 })[0] ?? null);
	if (!household) error(404, 'Add a household first, so there is something to preview.');

	const presetKey = url.searchParams.get('preset') ?? '5x7';
	const preset = CARD_PRESETS[presetKey as keyof typeof CARD_PRESETS];

	const options = preset
		? {
				widthIn: preset.width,
				heightIn: preset.height,
				variant: (presetKey.startsWith('insert')
					? 'insert'
					: url.searchParams.get('variant') === 'insert'
						? 'insert'
						: 'full') as 'full' | 'insert'
			}
		: {
				widthIn: clampInteger(url.searchParams.get('width'), 1, 20, 5),
				heightIn: clampInteger(url.searchParams.get('height'), 1, 20, 7),
				variant: (url.searchParams.get('variant') === 'insert' ? 'insert' : 'full') as
					| 'full'
					| 'insert'
			};

	const pdf = await buildSingleInvitation(household, invitationDetails(), options);

	return new Response(new Uint8Array(pdf), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': 'inline; filename="preview.pdf"',
			'cache-control': 'no-store'
		}
	});
};
