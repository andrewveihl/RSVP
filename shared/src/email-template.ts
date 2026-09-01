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
	'couple_names',
	'qr_code'
] as const;

/** The content id the embedded QR image is attached under. */
export const QR_CID = 'rsvp-qr';

export type MergeField = (typeof MERGE_FIELDS)[number];

export const MERGE_FIELD_HELP: Record<MergeField, string> = {
	household_name: "The household's name, as it appears on the guest list",
	rsvp_link: "The household's own RSVP link",
	wedding_date: 'The wedding date',
	venue: 'The venue name',
	deadline: 'The RSVP deadline',
	couple_names: 'Your names',
	qr_code: "The household's QR code, embedded in the message"
};

export interface MergeContext {
	householdName: string;
	rsvpLink: string;
	weddingDate: string;
	venue: string;
	deadline: string;
	coupleNames: string;
	/** Set only when a QR image is attached to this particular message. */
	qrCid?: string;
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
		case 'qr_code':
			// An <img> rather than a URL: it is attached to the message and referenced by
			// content id, so it shows even in a client that blocks remote images.
			// In a real send the code is attached and referenced by content id. In the
			// editor's preview there is nothing attached, so a placeholder of the same
			// size stands in -- a blank gap would read as a broken template.
			return context.qrCid
				? `<img src="cid:${context.qrCid}" alt="Scan to RSVP" width="180" height="180" style="display:block;margin:16px auto;border:1px solid #e8e4df;border-radius:8px" />`
				: '<div style="width:180px;height:180px;margin:16px auto;border:1px dashed #d8d4cf;border-radius:8px;color:#8a8a8a;font-size:12px;text-align:center;line-height:180px">QR code</div>';
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
		// Two fields are ours, not the couple's: the link is a URL we built (escaping it
		// would break an `&` in a query string) and the QR field is markup we emitted.
		if (!escape || field === 'rsvp_link' || field === 'qr_code') return value;
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
