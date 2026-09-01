/**
 * Merge-field rendering for reminder emails.
 *
 * Substitution happens *after* the template body has been sanitised, so a household
 * name containing `<` cannot inject markup: every value is HTML-escaped on the way in,
 * except `{{rsvp_link}}`, which is a URL we generated ourselves from a token.
 */
import { escapeHtml } from './sanitize';
import { rsvpUrl } from './tokens';
import type { Household } from './types';

export const MERGE_FIELDS = [
	'household_name',
	'rsvp_link',
	'wedding_date',
	'venue',
	'deadline',
	'couple_names'
] as const;

export type MergeField = (typeof MERGE_FIELDS)[number];

export const MERGE_FIELD_HELP: Record<MergeField, string> = {
	household_name: "The household's name, as it appears on the guest list",
	rsvp_link: "The household's own RSVP link",
	wedding_date: 'The wedding date',
	venue: 'The venue name',
	deadline: 'The RSVP deadline',
	couple_names: 'Your names'
};

export interface MergeContext {
	householdName: string;
	rsvpLink: string;
	weddingDate: string;
	venue: string;
	deadline: string;
	coupleNames: string;
}

/** Sample values, so the template editor's preview shows something realistic. */
export const SAMPLE_CONTEXT: MergeContext = {
	householdName: 'The Whitfield Family',
	rsvpLink: 'https://rsvp.example.com/rsvp/sample-token',
	weddingDate: 'Saturday, May 29, 2027',
	venue: 'The Old Barn',
	deadline: 'April 29, 2027',
	coupleNames: 'Andrew & Madeline'
};

function valueFor(field: MergeField, context: MergeContext): string {
	switch (field) {
		case 'household_name':
			return context.householdName;
		case 'rsvp_link':
			return context.rsvpLink;
		case 'wedding_date':
			return context.weddingDate;
		case 'venue':
			return context.venue;
		case 'deadline':
			return context.deadline;
		case 'couple_names':
			return context.coupleNames;
	}
}

const FIELD_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/**
 * Replaces `{{field}}` placeholders.
 *
 * An unrecognised field is left exactly as written rather than blanked: a typo the
 * couple can see in the preview is far better than an email that silently ships with a
 * hole where a name should be.
 */
export function renderTemplate(
	template: string,
	context: MergeContext,
	options: { escape?: boolean } = {}
): string {
	const escape = options.escape ?? true;

	return template.replace(FIELD_PATTERN, (match, rawField: string) => {
		const field = rawField.toLowerCase() as MergeField;
		if (!(MERGE_FIELDS as readonly string[]).includes(field)) return match;

		const value = valueFor(field, context);
		// The link is a URL we built; escaping it would break the `&` in a query string.
		if (!escape || field === 'rsvp_link') return value;
		return escapeHtml(value);
	});
}

/** Subject lines are plain text, so nothing there is ever HTML-escaped. */
export function renderSubject(subject: string, context: MergeContext): string {
	return renderTemplate(subject, context, { escape: false });
}

export interface ContextSource {
	siteUrl: string;
	weddingDate: string;
	venue: string;
	deadline: string;
	coupleNames: string;
}

export function contextForHousehold(household: Household, source: ContextSource): MergeContext {
	return {
		householdName: household.name,
		rsvpLink: rsvpUrl(source.siteUrl, household.token),
		weddingDate: source.weddingDate,
		venue: source.venue,
		deadline: source.deadline,
		coupleNames: source.coupleNames
	};
}

/**
 * Wraps a rendered body in a minimal HTML document.
 *
 * Everything is inline-styled and table-free by design: mail clients strip `<style>`
 * blocks unpredictably, and this needs to survive Gmail, Outlook and Apple Mail
 * without a rendering framework.
 */
export function wrapEmailHtml(bodyHtml: string, coupleNames: string): string {
	return [
		'<!doctype html>',
		'<html><head><meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${escapeHtml(coupleNames)}</title>`,
		'</head>',
		'<body style="margin:0;padding:24px;background:#faf9f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2d2d2d;line-height:1.6;">',
		'<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e4df;border-radius:12px;padding:32px;">',
		bodyHtml,
		'</div>',
		`<p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#8a8a8a;text-align:center;">${escapeHtml(coupleNames)}</p>`,
		'</body></html>'
	].join('\n');
}

/** A plain-text alternative, so the message is not spam-scored as HTML-only. */
export function htmlToText(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|h[1-4]|li|tr)>/gi, '\n')
		.replace(/<li>/gi, '- ')
		.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
