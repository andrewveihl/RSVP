/**
 * Input normalisation and validation.
 *
 * SQL injection is already handled structurally -- every query in `db/` is a prepared
 * statement with bound parameters, and no query is ever assembled from user input. So
 * the job here is different: keep junk out of the database (control characters,
 * unbounded strings, "17e9" as a guest count) and keep author-supplied HTML from
 * becoming a stored XSS in the guest site.
 */

/** Longest a single free-text field may be. Generous, but not unbounded. */
export const MAX_TEXT = 10_000;
export const MAX_LINE = 500;

/**
 * Strips control characters and collapses whitespace runs; returns a trimmed string.
 * Newlines survive only when `multiline` is set.
 */
export function cleanText(value: unknown, options: { multiline?: boolean; max?: number } = {}): string {
	if (typeof value !== 'string') return '';
	const max = options.max ?? (options.multiline ? MAX_TEXT : MAX_LINE);

	// C0 and C1 control characters, minus tab/newline/carriage return so multiline
	// text survives the pass below. These are the bytes that corrupt logs, CSV
	// exports and the strings we hand to the PDF writer.
	const stripped = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
	const normalised = options.multiline
		? stripped.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ')
		: stripped.replace(/\s+/g, ' ');

	return normalised.trim().slice(0, max);
}

/** A required single-line field: cleaned, and empty means "missing". */
export function requireText(value: unknown, max = MAX_LINE): string | null {
	const cleaned = cleanText(value, { max });
	return cleaned === '' ? null : cleaned;
}

/** Optional field: cleaned, with empty normalised to null for the database. */
export function optionalText(value: unknown, options?: { multiline?: boolean; max?: number }): string | null {
	const cleaned = cleanText(value, options);
	return cleaned === '' ? null : cleaned;
}

/**
 * Integer parsing that refuses anything that is not a plain integer.
 *
 * `Number('')` is 0 and `parseInt('12abc')` is 12; both would quietly accept a bad
 * guest count, so the string is pattern-checked before conversion.
 */
export function parseInteger(value: unknown, options: { min?: number; max?: number; fallback?: number } = {}): number | null {
	const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options;

	let n: number;
	if (typeof value === 'number') {
		if (!Number.isInteger(value)) return options.fallback ?? null;
		n = value;
	} else if (typeof value === 'string' && /^-?\d{1,9}$/.test(value.trim())) {
		n = Number.parseInt(value.trim(), 10);
	} else {
		return options.fallback ?? null;
	}

	if (n < min || n > max) return options.fallback ?? null;
	return n;
}

/** Clamps into range instead of rejecting -- used where a bad value is not fatal. */
export function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
	const parsed = parseInteger(value);
	if (parsed === null) return fallback;
	return Math.min(max, Math.max(min, parsed));
}

/**
 * Deliberately liberal email check.
 *
 * The authoritative test of an address is whether mail reaches it, so anything
 * stricter than "one @, no spaces, a dot in the domain" only rejects real addresses.
 */
export function normaliseEmail(value: unknown): string | null {
	const cleaned = cleanText(value, { max: 320 }).toLowerCase();
	if (!cleaned) return null;
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null;
	return cleaned;
}

/**
 * Only http(s) URLs are allowed through.
 *
 * Registry links and map links are rendered as anchors on the public site, so a
 * `javascript:` URL saved by a compromised admin session would be a stored XSS.
 */
export function safeUrl(value: unknown): string | null {
	const cleaned = cleanText(value, { max: 2000 });
	if (!cleaned) return null;
	try {
		const url = new URL(cleaned);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.toString();
	} catch {
		return null;
	}
}

const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** Escapes text for interpolation into an HTML email body. */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

const ALLOWED_TAGS = new Set([
	'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
	'h1', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'div', 'hr', 'table', 'tr', 'td', 'th', 'tbody'
]);

/**
 * A conservative allow-list sanitiser for the one place rich HTML is accepted: the
 * admin's email template bodies.
 *
 * Everything outside the tag list is dropped, every attribute except `href` is
 * dropped, and an `href` must survive `safeUrl`. This is not a full HTML parser and
 * is not trying to be: the input comes from an authenticated admin, so this is a
 * second line of defence, not the only one.
 */
export function sanitizeHtml(input: unknown): string {
	if (typeof input !== 'string') return '';

	let html = input.slice(0, 100_000);

	// Remove whole elements whose *content* is dangerous, not just their tags.
	html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
	html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?\s*>/gi, '');
	// Strip HTML comments, which can hide conditional-comment payloads.
	html = html.replace(/<!--[\s\S]*?-->/g, '');

	return html.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_match, slash: string, rawTag: string, attrs: string) => {
		const tag = rawTag.toLowerCase();
		if (!ALLOWED_TAGS.has(tag)) return '';
		if (slash) return `</${tag}>`;

		if (tag === 'a') {
			const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
			const candidate = href?.[2] ?? href?.[3] ?? href?.[4] ?? '';
			// Merge fields are substituted after sanitising, so a template's
			// `href="{{rsvp_link}}"` must survive the URL check untouched.
			const isMergeField = /^\s*\{\{\s*[a-z_]+\s*\}\}\s*$/i.test(candidate);
			const safe = isMergeField ? candidate.trim() : safeUrl(candidate);
			if (!safe) return '<a>';
			return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">`;
		}

		return `<${tag}>`;
	});
}

/** Turns author-entered plain text with blank-line paragraphs into safe HTML. */
export function paragraphsToHtml(text: string): string {
	return text
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean)
		.map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
		.join('\n');
}
