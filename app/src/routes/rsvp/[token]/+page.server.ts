import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfig, isRsvpClosed, rsvpDeadlineDate, weddingDateValue } from '$shared/config';
import { CSRF_FIELD, issueCsrfToken, verifyCsrf } from '$shared/csrf';
import { checkRateLimit } from '$shared/rate-limiter';
import { logger } from '$shared/logger';
import { formatLongDate } from '$shared/format';
import { isValidTokenFormat } from '$shared/tokens';
import { getHouseholdWithRsvpByToken } from '$shared/db';
import { MAX_GUESTS, maxGuestsFor, submitRsvp } from '$shared/rsvp-service';

/**
 * The household's own RSVP page.
 *
 * An unknown or malformed token does not 404. It renders the same page in a "we could
 * not find that link" state with the name look-up offered instead -- because the most
 * likely cause by far is a guest mistyping a URL from a printed card, not an attack,
 * and a bare 404 leaves them stuck.
 */
export const load: PageServerLoad = async ({ params, cookies, parent }) => {
	const { site } = await parent();

	const household = isValidTokenFormat(params.token)
		? getHouseholdWithRsvpByToken(params.token)
		: null;

	const deadline = rsvpDeadlineDate(site.settings.rsvp_deadline);
	const closed = isRsvpClosed(new Date(), site.settings.rsvp_deadline);

	return {
		found: household !== null,
		token: params.token,
		// Only what the page actually needs. The token is already in the URL; nothing
		// else about the household is exposed.
		household: household
			? {
					name: household.name,
					partySize: household.partySize,
					status: household.status,
					rsvp: household.rsvp
						? {
								attending: household.rsvp.attending,
								// The guest answered one number, so the guest is shown one number
								// back. The stored split is our bookkeeping, not theirs.
								total: household.rsvp.guestCount + household.rsvp.plusOneCount,
								updatedAt: household.rsvp.updatedAt
							}
						: null
				}
			: null,
		closed,
		deadlineLabel: deadline ? formatLongDate(deadline) : '',
		// This household's own ceiling, so the stepper simply stops there rather than
		// letting a guest pick a number the server is going to refuse. The server checks
		// it again regardless -- the form is a convenience, not the rule.
		maxGuests: household ? maxGuestsFor(household) : MAX_GUESTS,
		// Whether that ceiling is a real limit the couple set, or just the global sanity
		// bound. The form says different things about the two.
		capped: household !== null && household.maxExtraGuests !== null,
		// Absent when no wedding date is configured, which hides the button rather than
		// offering a calendar file for an invalid date.
		calendarUrl: weddingDateValue(site.weddingDate) ? '/rsvp/wedding.ics' : null,
		csrfToken: issueCsrfToken(cookies, getConfig().siteUrl)
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, params, locals }) => {
		const form = await request.formData();

		const csrf = verifyCsrf(request, cookies, form.get(CSRF_FIELD)?.toString() ?? null);
		if (!csrf.ok) {
			logger.warn(
				{ event: 'rsvp.csrf_rejected', reason: csrf.reason, clientIp: locals.clientIp },
				'RSVP submission rejected by CSRF check'
			);
			return fail(403, { error: 'Your session expired. Please reload the page and try again.' });
		}

		// The tight per-IP budget. It is applied to the submission only -- browsing the
		// site has its own, far looser, allowance in hooks.
		const budget = checkRateLimit(`rsvp:${locals.clientIp}`);
		if (!budget.allowed) {
			return fail(429, { error: 'Too many attempts. Please wait a minute and try again.' });
		}

		if (!isValidTokenFormat(params.token)) {
			return fail(404, { error: 'We could not find that invitation link.' });
		}

		const household = getHouseholdWithRsvpByToken(params.token);
		if (!household) {
			return fail(404, { error: 'We could not find that invitation link.' });
		}

		const outcome = submitRsvp(
			{
				attending: form.get('attending'),
				guestTotal: form.get('guestTotal'),
				honeypot: form.get('website')
			},
			{
				household,
				ipAddress: locals.clientIp,
				userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null
			}
		);

		if (!outcome.ok) {
			if (outcome.silent) {
				// A bot filled the honeypot. Answer as though it worked and store nothing,
				// so it has no signal to tune against.
				logger.warn({ event: 'rsvp.honeypot', clientIp: locals.clientIp }, 'honeypot tripped');
				return { success: true, attending: false, silent: true };
			}
			return fail(outcome.reason === 'closed' ? 403 : 400, { error: outcome.error });
		}

		return {
			success: true,
			attending: outcome.result.rsvp.attending,
			updated: !outcome.result.created
		};
	}
};
