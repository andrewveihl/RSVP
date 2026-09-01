/**
 * Printable invitations and QR insert cards, generated with pdf-lib.
 *
 * pdf-lib is pure JavaScript, which is what makes this work the same way in a test, on
 * Windows during development and inside an Alpine container -- no headless browser, no
 * native rendering library, no fonts to install.
 *
 * Where things go is decided in `invitation-layout.ts`, not here. This file only knows
 * how to put a draw operation onto a PDF page. The admin's live preview renders the
 * same operations as SVG, so the preview cannot disagree with what gets printed.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { qrPng } from './qr';
import { rsvpUrl } from './tokens';
import { hexToTriplet } from './theme';
import {
	inches,
	layoutCard,
	POINTS_PER_INCH,
	type CardGeometry,
	type FaceName,
	type InvitationText,
	type Measure
} from './invitation-layout';
import type { Household, InvitationContent } from './types';

export { inches, POINTS_PER_INCH };
export type { CardGeometry };

/** The card sizes the admin can pick, plus a custom escape hatch. */
export const CARD_PRESETS = {
	'5x7': { width: 5, height: 7, label: '5 x 7 in' },
	'4x6': { width: 4, height: 6, label: '4 x 6 in' },
	a6: { width: 4.13, height: 5.83, label: 'A6 (105 x 148 mm)' },
	'insert-3.5x5': { width: 3.5, height: 5, label: 'QR insert, 3.5 x 5 in' },
	'insert-2.5x3.5': { width: 2.5, height: 3.5, label: 'QR insert, 2.5 x 3.5 in' }
} as const;

export type CardPreset = keyof typeof CARD_PRESETS;

/** What a print shop expects around the trim, in inches. */
export const BLEED_IN = 0.125;

export interface CardOptions extends CardGeometry {
	widthIn: number;
	heightIn: number;
	variant: 'full' | 'insert';
}

export const DEFAULT_CARD: CardOptions = { widthIn: 5, heightIn: 7, variant: 'full' };

const INK = rgb(0.1, 0.1, 0.1);
const FAINT = rgb(0.45, 0.45, 0.45);
const CROP = rgb(0, 0, 0);

function accentColour(hex: string) {
	const triplet = hexToTriplet(hex);
	if (!triplet) return rgb(0.6, 0.62, 0.55);
	const [r, g, b] = triplet.split(' ').map((part) => Number(part) / 255);
	return rgb(r, g, b);
}

interface Fonts {
	display: PDFFont;
	displayBold: PDFFont;
	body: PDFFont;
}

/**
 * Turns the couple's stored invitation into the text the layout needs, with this
 * household's own name and link filled in.
 */
export function invitationTextFor(
	invitation: InvitationContent,
	household: Household,
	siteUrl: string
): InvitationText {
	return {
		eyebrow: invitation.eyebrow,
		names: invitation.names,
		inviteLine: invitation.inviteLine,
		dateLine: invitation.dateLine,
		timeLine: invitation.timeLine,
		venueName: invitation.venueName,
		venueAddress: invitation.venueAddress,
		qrCaption: invitation.qrCaption,
		householdName: household.name,
		url: rsvpUrl(siteUrl, household.token),
		showUrl: invitation.showUrl,
		showQr: invitation.showQr,
		showBorder: invitation.showBorder,
		font: invitation.font,
		accent: invitation.accent
	};
}

async function embedFonts(pdf: PDFDocument, face: 'serif' | 'sans'): Promise<Fonts> {
	if (face === 'sans') {
		return {
			display: await pdf.embedFont(StandardFonts.Helvetica),
			displayBold: await pdf.embedFont(StandardFonts.HelveticaBold),
			body: await pdf.embedFont(StandardFonts.Helvetica)
		};
	}
	return {
		display: await pdf.embedFont(StandardFonts.TimesRoman),
		displayBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
		// The body face stays sans even in the serif setting: small caps and a URL are
		// markedly more legible in it at 7pt.
		body: await pdf.embedFont(StandardFonts.Helvetica)
	};
}

function measurer(fonts: Fonts): Measure {
	return (text, face: FaceName, size) => fonts[face].widthOfTextAtSize(text, size);
}

async function drawCard(
	page: PDFPage,
	pdf: PDFDocument,
	fonts: Fonts,
	text: InvitationText,
	options: CardOptions,
	qrBytes: Uint8Array | null
): Promise<void> {
	const layout = layoutCard(text, options, measurer(fonts));
	const accent = accentColour(text.accent);

	// Everything is positioned relative to the trim box; the offset shifts it into the
	// media box when there is bleed.
	const ox = layout.offsetX;
	const oy = layout.offsetY;

	const colours = { ink: INK, faint: FAINT, accent, rule: accent, crop: CROP } as const;

	for (const op of layout.ops) {
		if (op.kind === 'rect') {
			page.drawRectangle({
				x: ox + op.x,
				y: oy + op.y,
				width: op.width,
				height: op.height,
				...(op.fill ? { color: rgb(1, 1, 1) } : {}),
				...(op.stroke
					? { borderColor: colours[op.stroke], borderWidth: op.strokeWidth ?? 1 }
					: {})
			});
		} else if (op.kind === 'line') {
			page.drawLine({
				start: { x: ox + op.x1, y: oy + op.y1 },
				end: { x: ox + op.x2, y: oy + op.y2 },
				thickness: op.width,
				color: colours[op.colour]
			});
		} else if (op.kind === 'text') {
			const font = fonts[op.face];
			const width = font.widthOfTextAtSize(op.text, op.size);
			// The layout gives a centre point; PDF draws from the left edge.
			page.drawText(op.text, {
				x: ox + op.x - width / 2,
				y: oy + op.y,
				size: op.size,
				font,
				color: colours[op.colour]
			});
		} else if (op.kind === 'image' && qrBytes) {
			const image = await pdf.embedPng(qrBytes);
			page.drawImage(image, {
				x: ox + op.x,
				y: oy + op.y,
				width: op.width,
				height: op.height
			});
		}
	}
}

/**
 * Renders one PDF containing a page per household.
 *
 * One document for a whole batch is what a print shop wants: it imposes and cuts in one
 * pass rather than opening two hundred files.
 */
export async function buildInvitationPdf(
	households: Household[],
	invitation: InvitationContent,
	siteUrl: string,
	options: CardOptions = DEFAULT_CARD
): Promise<Uint8Array> {
	const pdf = await PDFDocument.create();
	pdf.setTitle(`${invitation.names} -- invitations`);
	pdf.setCreator('wedding-rsvp');

	const fonts = await embedFonts(pdf, invitation.font);

	const bleed = inches(options.bleedIn ?? 0);
	const width = inches(options.widthIn) + bleed * 2;
	const height = inches(options.heightIn) + bleed * 2;

	for (const household of households) {
		const page = pdf.addPage([width, height]);
		// White ground first, so the bleed area is never transparent.
		page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });

		const text = invitationTextFor(invitation, household, siteUrl);
		// 600px at any print size is well past what a two-inch symbol can resolve, so
		// the QR is never what limits print quality.
		const qr = text.showQr ? await qrPng(text.url, { size: 600, margin: 2 }) : null;

		await drawCard(page, pdf, fonts, text, options, qr);
	}

	if (households.length === 0) {
		// An empty PDF is invalid; a page saying so is at least openable.
		const page = pdf.addPage([width, height]);
		page.drawText('No households selected.', {
			x: width / 2 - 60,
			y: height / 2,
			size: 12,
			font: fonts.body,
			color: FAINT
		});
	}

	return pdf.save();
}

/** A single-household PDF, for the per-guest download. */
export async function buildSingleInvitation(
	household: Household,
	invitation: InvitationContent,
	siteUrl: string,
	options: CardOptions = DEFAULT_CARD
): Promise<Uint8Array> {
	return buildInvitationPdf([household], invitation, siteUrl, options);
}
