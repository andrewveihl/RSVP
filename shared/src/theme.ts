/**
 * Turns the couple's theme choices into CSS the page can use.
 *
 * The site's palette already lives in custom properties (see each app's `app.css`), so
 * theming is a matter of overriding two or three of them rather than restyling
 * anything. That is also why dark mode needs no extra work here: the accent is
 * lightened for the dark palette by the same rule that lightens the shipped one.
 */
import type { ThemeContent } from './types';

/** Parses `#rgb` or `#rrggbb` into the `R G B` triplet the variables expect. */
export function hexToTriplet(hex: string): string | null {
	const value = hex.trim().replace(/^#/, '');

	const full =
		value.length === 3
			? value
					.split('')
					.map((char) => char + char)
					.join('')
			: value;

	if (!/^[0-9a-f]{6}$/i.test(full)) return null;

	const number = Number.parseInt(full, 16);
	return `${(number >> 16) & 255} ${(number >> 8) & 255} ${number & 255}`;
}

/** Mixes towards white by `amount` (0-1). Used to lift the accent for dark mode. */
function lighten(triplet: string, amount: number): string {
	return triplet
		.split(' ')
		.map((part) => Math.round(Number(part) + (255 - Number(part)) * amount))
		.join(' ');
}

/** Mixes towards black. The hover state is a step darker than the accent. */
function darken(triplet: string, amount: number): string {
	return triplet
		.split(' ')
		.map((part) => Math.round(Number(part) * (1 - amount)))
		.join(' ');
}

/**
 * Perceived brightness, 0 (black) to 1 (white).
 *
 * The usual sRGB weighting rather than a plain average: the eye reads green as far
 * brighter than blue, so `0 0 255` and `0 255 0` are nothing alike to look at even
 * though they average the same.
 */
function brightness(triplet: string): number {
	const [r, g, b] = triplet.split(' ').map(Number);
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * `:root` twice, which matches exactly the same element but at double the specificity.
 *
 * The stylesheet declares the shipped palette on a plain `:root`, and whichever rule
 * comes last would otherwise win -- and that order is not ours to control: Vite injects
 * the stylesheet via JavaScript in development, so it lands *after* this inline block.
 * Raising the specificity makes the theme authoritative regardless of order.
 */
const ROOT = ':root:root';

const FONT_STACKS = {
	'serif-sans': {
		display: "'Cormorant Garamond', 'Iowan Old Style', Georgia, 'Times New Roman', serif",
		body: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
	},
	'sans-sans': {
		display: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
		body: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
	},
	'serif-serif': {
		display: "'Cormorant Garamond', 'Iowan Old Style', Georgia, 'Times New Roman', serif",
		body: "'Iowan Old Style', Georgia, 'Times New Roman', serif"
	}
} as const;

/**
 * The `<style>` body to inline into the page head.
 *
 * Returns an empty string when the theme matches what the stylesheet already ships, so
 * an untouched site sends no extra bytes and the shipped palette stays authoritative.
 *
 * Inlined rather than served as a file because it changes whenever the couple edit it,
 * and a separate request would need cache-busting for a few hundred bytes.
 */
export function themeCss(
	theme: ThemeContent,
	shippedAccent = '#8A9A7B',
	shippedInk = '#1A1A1A'
): string {
	const rules: string[] = [];

	const accent = hexToTriplet(theme.accent);
	// An unparseable colour falls back to the stylesheet rather than breaking the page.
	if (accent && theme.accent.toLowerCase() !== shippedAccent.toLowerCase()) {
		rules.push(
			`${ROOT}{--c-accent:${accent};--c-accent-hover:${darken(accent, 0.12)};` +
				`--c-accent-soft:${lighten(accent, 0.86)}}`
		);
		// The light-mode accent is usually too dark to read on a dark ground, so it is
		// lifted rather than reused -- the same choice the shipped palette makes.
		rules.push(
			`@media (prefers-color-scheme:dark){${ROOT}{--c-accent:${lighten(accent, 0.35)};` +
				`--c-accent-hover:${lighten(accent, 0.5)};--c-accent-soft:${darken(accent, 0.55)}}}`
		);
	}

	const ink = hexToTriplet(theme.ink ?? '');
	if (ink && (theme.ink ?? '').toLowerCase() !== shippedInk.toLowerCase()) {
		// `--c-muted` follows the ink rather than staying the shipped grey, or a navy
		// heading would sit above a caption that had nothing to do with it.
		rules.push(`${ROOT}{--c-ink:${ink};--c-muted:${lighten(ink, 0.42)}}`);

		// The couple picks this against the light palette, which is what the editor
		// shows them. On the dark one a near-black is invisible, so it is lifted until
		// it reads -- and only lifted, so the hue they chose survives. A colour already
		// light enough is left exactly as it is.
		const darkInk = brightness(ink) < 0.55 ? lighten(ink, 0.82) : ink;
		rules.push(
			`@media (prefers-color-scheme:dark){${ROOT}{--c-ink:${darkInk};` +
				`--c-muted:${darken(darkInk, 0.32)}}}`
		);
	}

	const fonts = FONT_STACKS[theme.fonts];
	if (fonts && theme.fonts !== 'serif-sans') {
		rules.push(`${ROOT}{--font-display:${fonts.display};--font-body:${fonts.body}}`);
	}

	return rules.join('');
}

/**
 * Wraps the CSS in a style element, ready for `{@html}` in `<svelte:head>`.
 *
 * The tag name is concatenated rather than written literally on purpose: Svelte's
 * preprocessor scans a component's source for `<style>` and would hand this template
 * string to PostCSS as if it were the component's own stylesheet.
 *
 * Safe to inject: the content comes from `themeCss`, which emits only custom-property
 * declarations built from a parsed hex colour and a fixed set of font stacks.
 */
export function themeStyleTag(css: string): string {
	if (!css) return '';
	const tag = 'style';
	return `<${tag}>${css}</${tag}>`;
}
