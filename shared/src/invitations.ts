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
import {
	PDFDocument,
	StandardFonts,
	rgb,
	type PDFFont,
	type PDFImage,
	type PDFPage,
	type RGB
} from 'pdf-lib';
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

/**
 * The couple's photo, ready to embed.
 *
 * Passed in rather than read from the database here, so this module stays free of any
 * database import and keeps working in a test with nothing but bytes.
 *
 * pdf-lib embeds PNG and JPEG and nothing else, which is why the upload refuses the
 * other formats: a WebP that previewed perfectly and then silently vanished from the
 * print is the worst possible way to find that out.
 */
export interface InvitationPhoto {
	data: Uint8Array;
	mimetype: string;
}

/** The image formats that can actually be printed on a card. */
export const PRINTABLE_PHOTO_TYPES = new Set(['image/jpeg', 'image/png']);

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Fits an image inside its box without distorting it, centred.
 *
 * The SVG preview gets the identical result from `preserveAspectRatio="xMidYMid meet"`,
 * which is why the layout can hand both renderers a plain box and stay out of it.
 */
function containBox(box: Box, naturalWidth: number, naturalHeight: number): Box {
	if (naturalWidth <= 0 || naturalHeight <= 0) return box;

	const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
	const width = naturalWidth * scale;
	const height = naturalHeight * scale;

	return {
		x: box.x + (box.width - width) / 2,
		y: box.y + (box.height - height) / 2,
		width,
		height
	};
}

/**
 * Fills the box with the image, keeping its proportions and overflowing the rest.
 *
 * The mirror of `containBox`, and what `preserveAspectRatio="xMidYMid slice"` gives
 * the SVG preview for the same op. Cover always spills on one axis; see the caller for
 * what stops that spill reaching the paper.
 */
function coverBox(box: Box, naturalWidth: number, naturalHeight: number): Box {
	if (naturalWidth <= 0 || naturalHeight <= 0) return box;

	const scale = Math.max(box.width / naturalWidth, box.height / naturalHeight);
	const width = naturalWidth * scale;
	const height = naturalHeight * scale;

	return {
		x: box.x + (box.width - width) / 2,
		y: box.y + (box.height - height) / 2,
		width,
		height
	};
}

const INK = rgb(0.1, 0.1, 0.1);
const CROP = rgb(0, 0, 0);

function accentColour(hex: string) {
	return hexColour(hex, rgb(0.6, 0.62, 0.55));
}

/** A hex colour as pdf-lib wants it, or the fallback when it cannot be read. */
function hexColour(hex: string, fallback: RGB): RGB {
	const triplet = hexToTriplet(hex ?? '');
	if (!triplet) return fallback;
	const [r, g, b] = triplet.split(' ').map((part) => Number(part) / 255);
	return rgb(r, g, b);
}

/** Mixes `from` towards `to` by `amount`, for deriving the caption grey from the ink. */
function mix(from: RGB, to: RGB, amount: number): RGB {
	return rgb(
		from.red + (to.red - from.red) * amount,
		from.green + (to.green - from.green) * amount,
		from.blue + (to.blue - from.blue) * amount
	);
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
	siteUrl: string,
	/** True only when a photo is actually available to draw -- see `showPhoto`. */
	hasPhoto = false
): InvitationText {
	return {
		eyebrow: invitation.eyebrow,
		names: invitation.names,
		inviteLine: invitation.inviteLine,
		dateLine: invitation.dateLine,
		timeLine: invitation.timeLine,
		venueName: invitation.venueName,
		venueAddress: invitation.venueAddress,
		ceremonyLabel: invitation.ceremonyLabel,
		receptionName: invitation.receptionName,
		receptionAddress: invitation.receptionAddress,
		receptionLabel: invitation.receptionLabel,
		// Only the text matters to the layout; the ids exist so the editor can keep
		// track of rows across a re-render.
		lines: (invitation.lines ?? []).map((line) => ({
			text: line.text,
			style: line.style,
			slot: line.slot
		})),
		qrCaption: invitation.qrCaption,
		householdName: household.name,
		url: rsvpUrl(siteUrl, household.token),
		showUrl: invitation.showUrl,
		showQr: invitation.showQr,
		showPhoto: invitation.showPhoto && hasPhoto,
		showBorder: invitation.showBorder,
		photoMode: invitation.photoMode,
		align: invitation.align,
		qrPosition: invitation.qrPosition,
		scale: invitation.scale,
		spacing: invitation.spacing,
		font: invitation.font,
		accent: invitation.accent,
		ink: invitation.ink,
		background: invitation.background
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

/**
 * Embeds the couple's photo, or returns null if it cannot be embedded.
 *
 * A photo that pdf-lib rejects -- a truncated file, or a format that slipped past the
 * upload check -- must not take a whole batch of invitations down with it. The card
 * then lays out without one, which is a card the couple can still post.
 */
async function embedPhoto(pdf: PDFDocument, photo: InvitationPhoto | null): Promise<PDFImage | null> {
	if (!photo || photo.data.length === 0) return null;

	try {
		return photo.mimetype === 'image/jpeg'
			? await pdf.embedJpg(photo.data)
			: await pdf.embedPng(photo.data);
	} catch {
		return null;
	}
}

async function drawCard(
	page: PDFPage,
	pdf: PDFDocument,
	fonts: Fonts,
	text: InvitationText,
	options: CardOptions,
	qrBytes: Uint8Array | null,
	/** Embedded once for the whole batch by the caller, not once per page. */
	photo: PDFImage | null
): Promise<void> {
	const layout = layoutCard(text, options, measurer(fonts));
	const accent = accentColour(text.accent);
	const ink = hexColour(text.ink, INK);
	const card = hexColour(text.background, rgb(1, 1, 1));

	// Everything is positioned relative to the trim box; the offset shifts it into the
	// media box when there is bleed.
	const ox = layout.offsetX;
	const oy = layout.offsetY;

	// `faint` is the ink lightened rather than a fixed grey, so a card set in navy has
	// a navy-grey caption under it instead of a stray neutral one.
	const colours = { ink, faint: mix(ink, card, 0.42), accent, rule: accent, crop: CROP } as const;

	for (const op of layout.ops) {
		if (op.kind === 'rect') {
			page.drawRectangle({
				x: ox + op.x,
				y: oy + op.y,
				width: op.width,
				height: op.height,
				...(op.fill ? { color: card } : {}),
				...(op.opacity === undefined ? {} : { opacity: op.opacity }),
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
			// PDF always draws from the left edge, so a centred line has to be measured
			// and shifted; a ranged-left one is already where it belongs.
			const width = op.align === 'center' ? font.widthOfTextAtSize(op.text, op.size) : 0;
			page.drawText(op.text, {
				x: ox + op.x - width / 2,
				y: oy + op.y,
				size: op.size,
				font,
				color: colours[op.colour]
			});
		} else if (op.kind === 'image') {
			const image =
				op.role === 'photo' ? photo : qrBytes ? await pdf.embedPng(qrBytes) : null;
			// A missing image leaves its space empty rather than failing the whole batch.
			if (!image) continue;

			if (op.fit === 'cover') {
				// A cover image is a background, so it is drawn against the *media* box
				// rather than the trim: it has to reach the paper's edge, and with bleed
				// the trim stops short of that.
				//
				// Cover always overflows on one axis and pdf-lib has no clipping path,
				// but none is needed here -- the spill goes past the page, and nothing
				// outside the MediaBox is rendered or printed. That only holds because
				// this is the whole card; a cover image in a smaller slot would need a
				// real clip.
				const media = { x: 0, y: 0, width: layout.mediaWidth, height: layout.mediaHeight };
				const filled = coverBox(media, image.width, image.height);

				page.drawImage(image, {
					x: filled.x,
					y: filled.y,
					width: filled.width,
					height: filled.height
				});
				continue;
			}

			const box = op.fit === 'contain' ? containBox(op, image.width, image.height) : op;

			page.drawImage(image, {
				x: ox + box.x,
				y: oy + box.y,
				width: box.width,
				height: box.height
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
	options: CardOptions = DEFAULT_CARD,
	photo: InvitationPhoto | null = null
): Promise<Uint8Array> {
	const pdf = await PDFDocument.create();
	pdf.setTitle(`${invitation.names} -- invitations`);
	pdf.setCreator('wedding-rsvp');

	const fonts = await embedFonts(pdf, invitation.font);

	// Embedded once for the whole document. Two hundred pages all showing the same
	// photo should carry it once, not two hundred times -- the difference between a
	// 2MB PDF and a 400MB one nobody can email.
	const photoImage = invitation.showPhoto ? await embedPhoto(pdf, photo) : null;

	const bleed = inches(options.bleedIn ?? 0);
	const width = inches(options.widthIn) + bleed * 2;
	const height = inches(options.heightIn) + bleed * 2;

	for (const household of households) {
		const page = pdf.addPage([width, height]);
		// White ground first, so the bleed area is never transparent.
		page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });

		const text = invitationTextFor(invitation, household, siteUrl, photoImage !== null);
		// 600px at any print size is well past what a two-inch symbol can resolve, so
		// the QR is never what limits print quality.
		const qr = text.showQr ? await qrPng(text.url, { size: 600, margin: 2 }) : null;

		await drawCard(page, pdf, fonts, text, options, qr, photoImage);
	}

	if (households.length === 0) {
		// An empty PDF is invalid; a page saying so is at least openable.
		const page = pdf.addPage([width, height]);
		page.drawText('No households selected.', {
			x: width / 2 - 60,
			y: height / 2,
			size: 12,
			font: fonts.body,
			color: rgb(0.45, 0.45, 0.45)
		});
	}

	return pdf.save();
}

/** A single-household PDF, for the per-guest download. */
export async function buildSingleInvitation(
	household: Household,
	invitation: InvitationContent,
	siteUrl: string,
	options: CardOptions = DEFAULT_CARD,
	photo: InvitationPhoto | null = null
): Promise<Uint8Array> {
	return buildInvitationPdf([household], invitation, siteUrl, options, photo);
}
