/**
 * What every guest page needs to know about the site itself.
 *
 * Content and settings are read on each request rather than cached in a module: the
 * admin app is a *separate container* writing to the same database file, so an
 * in-process cache here would go stale the moment the couple edited anything, with no
 * event to invalidate it. The reads are indexed lookups against a handful of rows, so
 * doing them per request costs nothing worth optimising.
 */
import { error } from '@sveltejs/kit';
import { getSiteContent, effectiveSettings } from '$shared/db';
import { getConfig, isRsvpClosed, rsvpDeadlineDate } from '$shared/config';
import { formatLongDate } from '$shared/format';
import type { SectionToggles, SiteContent } from '$shared/types';

export interface SiteEnvelope {
	content: SiteContent;
	settings: Record<string, string>;
	coupleNames: string;
	weddingDate: string;
	weddingDateLabel: string;
	deadlineLabel: string;
	rsvpClosed: boolean;
	contactEmail: string;
	nav: { href: string; label: string }[];
}

/** Every content section, keyed the way the theme's `order` array names them. */
const NAV: Record<keyof SectionToggles, { href: string; label: string } | null> = {
	story: { href: '/our-story', label: 'Our Story' },
	details: { href: '/details', label: 'Details' },
	party: { href: '/wedding-party', label: 'Wedding Party' },
	gallery: { href: '/gallery', label: 'Photos' },
	registry: { href: '/registry', label: 'Registry' },
	faq: { href: '/faq', label: 'FAQ' },
	// Not a page of its own -- the countdown lives on the home page.
	countdown: null
};

/**
 * The section keys in the couple's chosen order, dropping unknown entries and adding
 * any they left out. Defensive because the order is stored JSON that a future version
 * -- or a hand-edited row -- could disagree with.
 */
function orderedSections(order: string[]): (keyof SectionToggles)[] {
	const known = Object.keys(NAV) as (keyof SectionToggles)[];
	const chosen = order.filter((key): key is keyof SectionToggles =>
		(known as string[]).includes(key)
	);
	return [...chosen, ...known.filter((key) => !chosen.includes(key))];
}

export function loadSite(): SiteEnvelope {
	const settings = effectiveSettings();
	const coupleNames = settings.couple_names || getConfig().coupleNames;
	const content = getSiteContent(coupleNames);

	const deadline = rsvpDeadlineDate(settings.rsvp_deadline);

	return {
		content,
		settings,
		coupleNames,
		weddingDate: settings.wedding_date,
		weddingDateLabel: formatLongDate(settings.wedding_date, content.details.dateLine),
		deadlineLabel: deadline ? formatLongDate(deadline) : '',
		rsvpClosed: isRsvpClosed(new Date(), settings.rsvp_deadline),
		contactEmail: settings.contact_email,
		// Ordered by the theme, filtered by the toggles. An unknown key in the stored
		// order is skipped, and any section the order forgets is appended, so a
		// half-written order can never make a page unreachable.
		nav: [
			...orderedSections(content.theme.order)
				.filter((key) => content.sections[key])
				.map((key) => NAV[key]),
			{ href: '/rsvp', label: content.wording.rsvpButton }
		].filter((item): item is { href: string; label: string } => item !== null)
	};
}

/**
 * Guards a content page behind its section toggle.
 *
 * A disabled section 404s rather than redirecting: the page genuinely does not exist
 * on this site, and a redirect would leave a stale link in someone's history working
 * forever in a way that looks intentional.
 */
export function requireSection(content: SiteContent, section: keyof SectionToggles): void {
	if (!content.sections[section]) error(404, 'Not found');
}
