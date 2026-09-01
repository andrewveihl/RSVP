import type { LayoutServerLoad } from './$types';
import { loadSite } from '$lib/server/site';
import { themeCss } from '$shared/theme';

/**
 * The site envelope -- navigation, names, dates -- for every page.
 *
 * Content pages are public and identical for everyone, so they are given a short
 * shared cache window. `/rsvp` is excluded: those pages are keyed to one household and
 * `hooks.server.ts` already stamps them `no-store`.
 */
export const load: LayoutServerLoad = ({ url, setHeaders }) => {
	if (!url.pathname.startsWith('/rsvp')) {
		setHeaders({ 'cache-control': 'public, max-age=0, must-revalidate' });
	}

	const site = loadSite();

	// Inlined rather than served as a file: it is a few hundred bytes that change
	// whenever the couple edit the theme, so a cacheable request would need busting.
	return { site, themeCss: themeCss(site.content.theme) };
};
