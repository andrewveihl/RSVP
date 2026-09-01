/**
 * The checks every admin mutation runs before it touches anything.
 *
 * They are collected here rather than repeated per action because the failure mode of
 * "one route forgot the CSRF check" is silent, and a single helper makes the omission
 * visible in review: an action that does not call `guard` stands out.
 */
import { fail, type ActionFailure, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { CSRF_FIELD, issueCsrfToken, verifyCsrf } from '$shared/csrf';
import { getConfig } from '$shared/config';
import { logger } from '$shared/logger';

export function adminCsrfToken(cookies: Cookies): string {
	return issueCsrfToken(cookies, getConfig().adminUrl);
}

export interface GuardOk {
	ok: true;
	form: FormData;
}

export type GuardResult = GuardOk | ActionFailure<{ error: string }>;

function isFailure(result: GuardResult): result is ActionFailure<{ error: string }> {
	return !('ok' in result);
}

/**
 * Reads the form body and validates the session and the CSRF token.
 *
 * `locals.admin` is re-checked here even though the layout guard already redirected
 * unauthenticated visitors: the layout only guards *page loads*, and a form action can
 * be posted to directly without ever rendering the page.
 */
export async function guard(event: RequestEvent): Promise<GuardResult> {
	if (!event.locals.admin) {
		return fail(401, { error: 'Your session expired. Please sign in again.' });
	}

	const form = await event.request.formData();

	const csrf = verifyCsrf(event.request, event.cookies, form.get(CSRF_FIELD)?.toString() ?? null);
	if (!csrf.ok) {
		logger.warn(
			{ event: 'admin.csrf_rejected', reason: csrf.reason, clientIp: event.locals.clientIp },
			'admin action rejected by CSRF check'
		);
		return fail(403, { error: 'Your session expired. Please reload the page and try again.' });
	}

	return { ok: true, form };
}

/** Narrowing helper, so call sites read as `if (isGuardFailure(g)) return g;`. */
export function isGuardFailure(result: GuardResult): result is ActionFailure<{ error: string }> {
	return isFailure(result);
}

/** Collects repeated `ids` checkbox values from a bulk-action form. */
export function selectedIds(form: FormData): string[] {
	return form
		.getAll('ids')
		.map((value) => value.toString())
		.filter((value) => /^[0-9a-f-]{36}$/i.test(value));
}
