import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listHouseholds } from '$shared/db';
import { toCsv } from '$shared/csv';
import { getConfig } from '$shared/config';
import { rsvpUrl } from '$shared/tokens';

/**
 * The whole guest list as a CSV.
 *
 * The columns are named so that re-importing this file maps itself: the header
 * wording matches what `guessMapping` recognises, which makes the export a working
 * backup of the list rather than a read-only report.
 *
 * The RSVP link is included, which means this file contains every household's token.
 * That is the right call -- it is what makes the export a real backup -- but it is why
 * the endpoint is behind the session and marked `no-store`.
 */
export const GET: RequestHandler = ({ locals, url }) => {
	if (!locals.admin) error(401, 'Not signed in.');

	const includeLinks = url.searchParams.get('links') !== '0';
	const siteUrl = getConfig().siteUrl;

	const headers = [
		'Household name',
		'Email',
		'Phone',
		'Mailing address',
		'Party size',
		'Batch',
		'Notes',
		'Status',
		'Attending',
		'Guest count',
		'Plus ones',
		'Total attending',
		'Replied at',
		'Invitation sent',
		...(includeLinks ? ['RSVP link'] : [])
	];

	const rows = listHouseholds({ sort: 'name' }).map((household) => [
		household.name,
		household.email ?? '',
		household.phone ?? '',
		household.mailingAddress ?? '',
		household.partySize,
		household.batch ?? '',
		household.notes ?? '',
		household.status,
		household.rsvp ? (household.rsvp.attending ? 'yes' : 'no') : '',
		household.rsvp?.guestCount ?? '',
		household.rsvp?.plusOneCount ?? '',
		household.attendingTotal,
		household.rsvp?.submittedAt ?? '',
		household.invitationSent ? 'yes' : 'no',
		...(includeLinks ? [rsvpUrl(siteUrl, household.token)] : [])
	]);

	const stamp = new Date().toISOString().slice(0, 10);

	return new Response(toCsv(headers, rows), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="guest-list-${stamp}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
