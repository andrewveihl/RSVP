import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { adminCsrfToken } from '$lib/server/guard';
import { getSetting } from '$shared/db';
import { getConfig } from '$shared/config';

/**
 * Admin auth guard.
 *
 * `/` is the login form, so it is the one path an unauthenticated visitor may see.
 * Everything else bounces back to it with a `redirectTo`, so they land where they were
 * headed once they sign in.
 */
export const load: LayoutServerLoad = ({ locals, url, cookies, setHeaders }) => {
	// Nothing in the admin app may be cached by a proxy or the browser.
	setHeaders({ 'cache-control': 'no-store' });

	const isLoginPage = url.pathname === '/';

	if (!locals.admin && !isLoginPage) {
		const target = url.pathname + url.search;
		redirect(303, `/?redirectTo=${encodeURIComponent(target)}`);
	}

	return {
		admin: locals.admin,
		// Minted once per page load and rendered into every form on it.
		csrfToken: adminCsrfToken(cookies),
		coupleNames: locals.admin ? getSetting('couple_names') : '',
		// The cookie's own expiry is what actually enforces the timeout; this is so the
		// warning counts down against the same number rather than a guess.
		sessionTtlMs: getConfig().adminSessionTtlMs
	};
};
