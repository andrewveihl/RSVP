import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig, weddingDateValue } from '$shared/config';
import { getSection, getSetting } from '$shared/db';
import { buildIcs } from '$shared/calendar';

/**
 * The calendar file offered on the RSVP confirmation.
 *
 * Public and unauthenticated: it holds the date and the venue, which are on the site's
 * Details page anyway, and nothing about any household. Keeping it token-free means the
 * button is a plain link that works from an email or a bookmark.
 */
export const GET: RequestHandler = ({ setHeaders }) => {
	const start = weddingDateValue(getSetting('wedding_date'));
	if (!start) error(404, 'No wedding date has been set.');

	const coupleNames = getSetting('couple_names');
	const details = getSection('details', coupleNames);

	// The stored date is a day, not a time. 4pm is the conventional ceremony hour and
	// is what the shipped copy says; the couple's own time line is put in the
	// description, where it is read rather than parsed.
	start.setHours(16, 0, 0, 0);

	const venue = [getSetting('venue_name') || details.venueName, getSetting('venue_address') || details.venueAddress]
		.filter(Boolean)
		.join(', ');

	const ics = buildIcs({
		// Stable, so adding it twice updates the same entry instead of duplicating it.
		uid: `wedding-${getSetting('wedding_date')}@${new URL(getConfig().siteUrl).hostname}`,
		title: `${coupleNames} — Wedding`,
		description: [details.timeLine, `More detail: ${getConfig().siteUrl}/details`]
			.filter(Boolean)
			.join('\n'),
		location: venue,
		start,
		url: getConfig().siteUrl
	});

	setHeaders({
		'content-type': 'text/calendar; charset=utf-8',
		'content-disposition': 'attachment; filename="wedding.ics"',
		'cache-control': 'public, max-age=3600'
	});

	return new Response(ics);
};
