/**
 * The invitation, rendered as SVG for the admin's live preview.
 *
 * It consumes exactly the draw operations that `invitations.ts` hands to pdf-lib, so
 * the preview cannot disagree with the printed card about where anything sits. Build a
 * preview independently in HTML and it drifts the moment either side changes -- and the
 * drift is discovered after something has been printed.
 *
 * Two honest differences remain, both cosmetic:
 *
 * - Text is measured with an approximation of the standard PDF font widths rather than
 *   the real metrics, because those live inside pdf-lib's embedded fonts. It is close
 *   enough to place a line; it never decides what is printed.
 * - The browser substitutes its own Times and Helvetica, which are metrically
 *   compatible but not byte-identical to the PDF base-14 faces.
 */
import { layoutCard, type CardGeometry, type FaceName, type InvitationText, type Measure } from './invitation-layout';
import { escapeHtml } from './sanitize';
import { hexToTriplet } from './theme';

/**
 * Average character widths, as a fraction of the font size, for the base-14 faces.
 *
 * Derived from the Adobe metrics for Times Roman and Helvetica. A per-character table
 * would be more accurate, but this is a preview: the error is a percent or two on a
 * line, which never changes which line a word lands on at these sizes.
 */
const WIDTH_FACTOR: Record<FaceName, number> = {
	display: 0.46,
	displayBold: 0.5,
	body: 0.52
};

/** Wider glyphs cost more; the narrow ones cost less. */
function approximateWidth(text: string, face: FaceName, size: number): number {
	let units = 0;
	for (const char of text) {
		if (/[ilj.,:;'!|]/.test(char)) units += 0.32;
		else if (/[A-Z]/.test(char)) units += 1.22;
		else if (/[mwMW]/.test(char)) units += 1.45;
		else units += 1;
	}
	return units * WIDTH_FACTOR[face] * size;
}

export const previewMeasure: Measure = approximateWidth;

const FONT_STACK = {
	serif: {
		display: "'Times New Roman', Times, serif",
		displayBold: "'Times New Roman', Times, serif",
		body: 'Helvetica, Arial, sans-serif'
	},
	sans: {
		display: 'Helvetica, Arial, sans-serif',
		displayBold: 'Helvetica, Arial, sans-serif',
		body: 'Helvetica, Arial, sans-serif'
	}
} as const;

function hexOrDefault(hex: string, fallback: string): string {
	return hexToTriplet(hex ?? '') ? hex : fallback;
}

/**
 * Mixes one hex colour towards another, as `#rrggbb`.
 *
 * The same arithmetic `invitations.ts` does in pdf-lib's 0-1 space. Two
 * implementations of one idea is a drift risk, but the alternative is a colour module
 * that either imports pdf-lib into the browser bundle or hands back a shape neither
 * renderer wants.
 */
function mix(from: string, to: string, amount: number): string {
	const channels = (hex: string) => {
		const triplet = hexToTriplet(hex);
		return triplet ? triplet.split(' ').map(Number) : [0, 0, 0];
	};

	const [fr, fg, fb] = channels(from);
	const [tr, tg, tb] = channels(to);
	const blend = (a: number, b: number) => Math.round(a + (b - a) * amount);

	return `rgb(${blend(fr, tr)} ${blend(fg, tg)} ${blend(fb, tb)})`;
}

export interface SvgOptions extends CardGeometry {
	/** A data URL for the QR code, or null to leave a placeholder square. */
	qrDataUrl?: string | null;
	/**
	 * URL for the couple's photo, or null for a placeholder.
	 *
	 * A plain same-origin URL rather than a data URL: the admin already serves these
	 * bytes at `/images/[id]` behind the session, and inlining a wedding photo into
	 * every re-render of the preview would mean base64-ing it on every keystroke.
	 */
	photoUrl?: string | null;
}

/**
 * Renders the card as a standalone SVG string.
 *
 * The viewBox is in PDF points, so the preview scales to any width the admin panel
 * gives it while staying dimensionally exact.
 */
export function invitationSvg(text: InvitationText, options: SvgOptions): string {
	const layout = layoutCard(text, options, previewMeasure);
	const accent = hexOrDefault(text.accent, '#8A9A7B');
	const ink = hexOrDefault(text.ink, '#1a1a1a');
	const card = hexOrDefault(text.background, '#ffffff');
	const fonts = FONT_STACK[text.font] ?? FONT_STACK.serif;

	const colours: Record<string, string> = {
		ink,
		// Mixed towards the card rather than a fixed grey, matching what the PDF side
		// derives, so a navy card gets a navy-grey caption in both.
		faint: mix(ink, card, 0.42),
		accent,
		rule: accent,
		crop: '#000000'
	};

	const parts: string[] = [];

	// The media box in the card's own colour, so bleed reads as the paper does.
	parts.push(
		`<rect x="0" y="0" width="${layout.mediaWidth}" height="${layout.mediaHeight}" fill="${card}"/>`
	);

	for (const op of layout.ops) {
		// SVG's origin is top-left and PDF's is bottom-left, so every y is flipped.
		const flip = (y: number) => layout.mediaHeight - (layout.offsetY + y);
		const x = (value: number) => layout.offsetX + value;

		if (op.kind === 'rect') {
			parts.push(
				`<rect x="${x(op.x)}" y="${flip(op.y + op.height)}" width="${op.width}" height="${op.height}" ` +
					`fill="${op.fill ? card : 'none'}" ` +
					(op.opacity === undefined ? '' : `fill-opacity="${op.opacity}" `) +
					`stroke="${op.stroke ? colours[op.stroke] : 'none'}" stroke-width="${op.strokeWidth ?? 0}"/>`
			);
		} else if (op.kind === 'line') {
			parts.push(
				`<line x1="${x(op.x1)}" y1="${flip(op.y1)}" x2="${x(op.x2)}" y2="${flip(op.y2)}" ` +
					`stroke="${colours[op.colour]}" stroke-width="${op.width}"/>`
			);
		} else if (op.kind === 'text') {
			parts.push(
				`<text x="${x(op.x)}" y="${flip(op.y)}" text-anchor="${op.align === 'left' ? 'start' : 'middle'}" ` +
					`font-family="${fonts[op.face]}" font-size="${op.size}" fill="${colours[op.colour]}">` +
					`${escapeHtml(op.text)}</text>`
			);
		} else if (op.kind === 'image') {
			const y = flip(op.y + op.height);
			const href = op.role === 'photo' ? options.photoUrl : options.qrDataUrl;

			if (href) {
				// `meet` is contain and `slice` is cover, both centred -- exactly what the
				// PDF side computes for the same box, so the two agree without either
				// being told the image's proportions. `slice` also clips to the element's
				// own bounds, which is the crop the PDF has to build a form XObject for.
				const aspect =
					op.fit === 'contain' ? 'xMidYMid meet' : op.fit === 'cover' ? 'xMidYMid slice' : 'none';
				parts.push(
					`<image x="${x(op.x)}" y="${y}" width="${op.width}" height="${op.height}" ` +
						`href="${escapeHtml(href)}" preserveAspectRatio="${aspect}"/>`
				);
			} else {
				// A placeholder, so the layout still reads correctly while the real code
				// is being fetched.
				parts.push(
					`<rect x="${x(op.x)}" y="${y}" width="${op.width}" height="${op.height}" ` +
						`fill="#f0f0f0" stroke="#d8d8d8" stroke-width="0.5"/>`
				);
			}
		}
	}

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.mediaWidth} ${layout.mediaHeight}" ` +
		`width="100%" role="img" aria-label="Invitation preview">${parts.join('')}</svg>`
	);
}
