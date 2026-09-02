import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfig } from '$shared/config';
import { logger } from '$shared/logger';
import { checkRateLimit } from '$shared/rate-limiter';
import { CSRF_FIELD, verifyCsrf } from '$shared/csrf';
import {
	adminPasswordStatus,
	clearSessionCookie,
	createSessionToken,
	setSessionCookie,
	verifyAdminPassword
} from '$shared/session';
import { logActivity } from '$shared/db';

/**
 * Admin login. A form action rather than an API route, since this is a real form
 * submission and it should keep working with JavaScript disabled.
 */

/**
 * Only ever redirect within this site -- never to an attacker-supplied absolute URL.
 *
 * A leading `//` is rejected as well as an absolute URL: `//evil.example` is a
 * protocol-relative URL, which the browser would happily follow off-site.
 */
function safeRedirect(target: string | null): string {
	if (!target) return '/dashboard';
	if (!target.startsWith('/') || target.startsWith('//')) return '/dashboard';
	return target;
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.admin) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));

	return {
		redirectTo: url.searchParams.get('redirectTo') ?? '',
		configured: Boolean(getConfig().adminPassword),
		siteUrl: getConfig().siteUrl
	};
};

export const actions: Actions = {
	// Named rather than `default`: SvelteKit forbids mixing a default action with
	// named ones, and the nav needs a `logout` action.
	login: async ({ request, cookies, locals }) => {
		const form = await request.formData();
		const password = form.get('password');
		const redirectTo = safeRedirect(
			typeof form.get('redirectTo') === 'string' ? (form.get('redirectTo') as string) : null
		);

		// The brief's tighter budget: five attempts per fifteen minutes, per IP.
		const attempt = checkRateLimit(
			`admin-login:${locals.clientIp}`,
			getConfig().adminLoginRateLimit
		);
		if (!attempt.allowed) {
			logger.warn(
				{ event: 'admin.login_rate_limited', clientIp: locals.clientIp },
				'admin login rate limited'
			);
			return fail(429, {
				error: `Too many attempts. Try again in about ${Math.ceil(attempt.retryAfter / 60)} minute(s).`
			});
		}

		// And the same budget counted across every address at once. The per-IP cap alone
		// only costs an attacker addresses, and addresses are cheap -- a single IPv6
		// allocation is billions of them. This bounds the whole attack rather than each
		// participant in it.
		//
		// It is deliberately set far above what two people mistyping a password could
		// reach, because it can be held down by an attacker: while one is running, the
		// couple may have to wait out the window (or `docker compose restart admin`,
		// which clears the counters, since they are in memory). That is the better half
		// of the trade -- the alternative is unlimited guessing.
		const global = checkRateLimit('admin-login:global', getConfig().adminLoginGlobalLimit);
		if (!global.allowed) {
			logger.warn(
				{ event: 'admin.login_rate_limited_global', clientIp: locals.clientIp },
				'admin login refused: global attempt ceiling reached'
			);
			return fail(429, {
				error: `Too many attempts. Try again in about ${Math.ceil(global.retryAfter / 60)} minute(s).`
			});
		}

		const passwordStatus = adminPasswordStatus();
		if (passwordStatus === 'unset') {
			return fail(500, { error: 'ADMIN_PASSWORD is not set on the server.' });
		}
		if (passwordStatus === 'placeholder') {
			// Said plainly, because the only person who can see this is standing at a
			// panel that would otherwise be open to anyone who has read .env.example.
			return fail(500, {
				error:
					'ADMIN_PASSWORD is still the example value from .env.example, which is public. ' +
					'Set a real one in .env and restart the admin container.'
			});
		}

		if (typeof password !== 'string' || !verifyAdminPassword(password)) {
			logger.warn(
				{ event: 'admin.login_failed', clientIp: locals.clientIp },
				'admin login failed'
			);
			// One message for both "wrong password" and "no such account": there is only
			// one account, so any difference here is pure information for a guesser.
			return fail(401, { error: 'Incorrect password.' });
		}

		setSessionCookie(cookies, createSessionToken());
		logger.info({ event: 'admin.login', clientIp: locals.clientIp }, 'admin logged in');
		logActivity({
			eventType: 'admin_login',
			description: 'Signed in to the admin panel',
			ipAddress: locals.clientIp
		});
		redirect(303, redirectTo);
	},

	logout: async ({ request, cookies, locals }) => {
		// Logout changes state, so it gets the same CSRF treatment as everything else --
		// otherwise any page on the internet could sign the couple out mid-task.
		const form = await request.formData();
		const csrf = verifyCsrf(request, cookies, form.get(CSRF_FIELD)?.toString() ?? null);
		if (!csrf.ok) return fail(403, { error: 'Could not sign you out. Please reload and retry.' });

		clearSessionCookie(cookies);
		logger.info({ event: 'admin.logout', clientIp: locals.clientIp }, 'admin logged out');
		redirect(303, '/');
	}
};
