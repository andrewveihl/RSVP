import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkRateLimit } from '$shared/rate-limiter';
import { cleanText } from '$shared/sanitize';
import { searchHouseholdsByName } from '$shared/db';

/**
 * Type-ahead for the name look-up.
 *
 * It returns names and nothing else -- no ids, no tokens. Choosing a name still posts
 * back through the form action, which is where the redirect to the token URL is
 * decided. So this endpoint can confirm that a name is on the guest list, which is the
 * minimum any "find your invitation" feature must do, but it cannot hand anyone an
 * invitation.
 *
 * It carries its own rate limit, tighter than the page budget: this is the one route
 * on the site where repeated calls could be used to walk a guest list.
 */
const SEARCH_RATE_LIMIT = { max: 30, windowMs: 60_000 };

export const GET: RequestHandler = ({ url, locals, setHeaders }) => {
	const budget = checkRateLimit(`lookup-suggest:${locals.clientIp}`, SEARCH_RATE_LIMIT);
	if (!budget.allowed) {
		return json(
			{ matches: [] },
			{ status: 429, headers: { 'retry-after': String(budget.retryAfter) } }
		);
	}

	setHeaders({ 'cache-control': 'no-store' });

	const query = cleanText(url.searchParams.get('q'), { max: 120 });
	if (query.length < 2) return json({ matches: [] });

	return json({ matches: searchHouseholdsByName(query, 6).map((household) => household.name) });
};
