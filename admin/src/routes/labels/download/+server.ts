import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CSRF_FIELD, verifyCsrf } from '$shared/csrf';
import { getHouseholdsByIds, listHouseholds } from '$shared/db';
import { buildLabelPdf, LABEL_LAYOUTS, type LabelSheet } from '$shared/labels';
import { cleanText, clampInteger } from '$shared/sanitize';
import type { RsvpStatus } from '$shared/types';

/**
 * Address label sheets as a PDF.
 *
 * Households with no address on file are dropped rather than printed as a bare name:
 * a label with only a name is not postable, and a sheet with gaps in it is confusing
 * to feed. The count of what was dropped comes back in the filename so it is not
 * silent.
 */
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	if (!locals.admin) error(401, 'Not signed in.');

	const form = await request.formData();
	const csrf = verifyCsrf(request, cookies, form.get(CSRF_FIELD)?.toString() ?? null);
	if (!csrf.ok) error(403, 'Your session expired. Reload the page and try again.');

	const scope = form.get('scope')?.toString() ?? 'selected';
	const ids = form.getAll('ids').map((value) => value.toString());

	let households =
		scope === 'selected' && ids.length > 0 ? getHouseholdsByIds(ids) : listHouseholds({ sort: 'name' });

	if (scope === 'attending' || scope === 'pending' || scope === 'declined') {
		households = households.filter((household) => household.status === (scope as RsvpStatus));
	}
	if (scope === 'unsent') {
		households = households.filter((household) => !household.invitationSent);
	}

	const addressable = households.filter((household) => household.mailingAddress?.trim());
	if (addressable.length === 0) {
		error(400, 'None of those households has a mailing address on file.');
	}

	const sheetKey = form.get('sheet')?.toString() ?? '5160';
	const sheet: LabelSheet = (sheetKey in LABEL_LAYOUTS ? sheetKey : '5160') as LabelSheet;

	const pdf = await buildLabelPdf(addressable, {
		sheet,
		returnAddress: cleanText(form.get('returnAddress'), { multiline: true, max: 300 }) || undefined,
		showOutlines: form.get('outlines') === '1',
		skip: clampInteger(form.get('skip'), 0, 60, 0)
	});

	return new Response(new Uint8Array(pdf), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename="labels-${sheet}-${addressable.length}.pdf"`,
			'cache-control': 'no-store'
		}
	});
};
