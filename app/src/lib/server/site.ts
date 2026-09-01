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

/** Nav entries, in the order they appear, each gated by its section toggle. */
const NAV: { href: string; label: string; section: keyof SectionToggles | null }[] = [
	{ href: '/our-story', label: 'Our Story', section: 'story' },
	{ href: '/details', label: 'Details', section: 'details' },
	{ href: '/wedding-party', label: 'Wedding Party', section: 'party' },
	{ href: '/gallery', label: 'Photos', section: 'gallery' },
	{ href: '/registry', label: 'Registry', section: 'registry' },
	{ href: '/faq', label: 'FAQ', section: 'faq' },
	{ href: '/rsvp', label: 'RSVP', section: null }
];

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
		nav: NAV.filter((item) => item.section === null || content.sections[item.section]).map(
			({ href, label }) => ({ href, label })
		)
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
