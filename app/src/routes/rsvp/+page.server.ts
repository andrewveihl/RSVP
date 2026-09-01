import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfig } from '$shared/config';
import { CSRF_FIELD, issueCsrfToken, verifyCsrf } from '$shared/csrf';
import { checkRateLimit } from '$shared/rate-limiter';
import { cleanText } from '$shared/sanitize';
import { logger } from '$shared/logger';
import { searchHouseholdsByName } from '$shared/db';
import { rsvpUrl } from '$shared/tokens';

/**
 * The universal fallback: find your invitation by name.
 *
 * This is also where the universal QR code points, so it is the one RSVP page reachable
 * without a token. That makes it the only place a name could be used to *discover* an
 * invitation, so it is deliberately careful:
 *
 * - Tokens are never rendered. An exact single match is answered with a redirect, so
 *   the token appears only in the browser's own navigation.
 * - Ambiguous matches show names only, and each is a POST back with the chosen name --
 *   never a link carrying a token.
 * - It is rate limited like a login, because that is what enumerating a guest list
 *   would look like.
 */
const LOOKUP_RATE_LIMIT = { max: 12, windowMs: 60_000 };

export const load: PageServerLoad = ({ cookies }) => {
	return { csrfToken: issueCsrfToken(cookies, getConfig().siteUrl) };
};

/**
 * Every failure returns the same shape.
 *
 * A union of differently-shaped failures would mean the page could not read
 * `form.query` without narrowing on each branch, so the fields are always present and
 * the page reads them straight.
 */
function lookupFailure(status: number, error: string, query = '', notFound = false) {
	return fail(status, { error, query, notFound, matches: [] as { name: string }[] });
}

export const actions: Actions = {
	default: async ({ request, cookies, locals }) => {
		const form = await request.formData();

		const csrf = verifyCsrf(request, cookies, form.get(CSRF_FIELD)?.toString() ?? null);
		if (!csrf.ok) {
			return lookupFailure(403, 'Your session expired. Please reload the page and try again.');
		}

		const budget = checkRateLimit(`lookup:${locals.clientIp}`, LOOKUP_RATE_LIMIT);
		if (!budget.allowed) {
			logger.warn(
				{ event: 'rsvp.lookup_rate_limited', clientIp: locals.clientIp },
				'name lookup rate limited'
			);
			return lookupFailure(429, 'Too many searches. Please wait a minute and try again.');
		}

		const query = cleanText(form.get('name'), { max: 120 });
		if (query.length < 2) {
			return lookupFailure(400, 'Please type at least two letters of your name.', query);
		}

		const matches = searchHouseholdsByName(query);

		if (matches.length === 0) {
			return lookupFailure(404, `We couldn't find "${query}" on the guest list.`, query, true);
		}

		// An exact name wins outright. Without this, picking "The Smith Family" from the
		// disambiguation list when "The Smith Family Jr" also exists would substring-match
		// both again and show the same list forever.
		const exact = matches.filter((match) => match.name.toLowerCase() === query.toLowerCase());
		const resolved = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;

		if (resolved) {
			redirect(303, rsvpUrl('', resolved.token));
		}

		// Several possibilities: show the names so the guest can pick, without ever
		// putting a token on the page.
		return {
			query,
			notFound: false,
			error: '',
			matches: matches.map((match) => ({ name: match.name }))
		};
	}
};
