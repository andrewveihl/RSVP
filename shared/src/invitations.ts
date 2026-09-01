/**
 * Printable invitations and QR insert cards, generated with pdf-lib.
 *
 * pdf-lib is pure JavaScript, which is what makes this work the same way in a test, on
 * Windows during development and inside an Alpine container -- no headless browser, no
 * native rendering library, no fonts to install.
 *
 * Everything is laid out in points (72 per inch) because that is the PDF unit; the
 * admin thinks in inches, so `inches()` is the only conversion and it happens once at
 * the boundary.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { qrPng } from './qr';
import { rsvpUrl } from './tokens';
import type { Household } from './types';

export const POINTS_PER_INCH = 72;

export function inches(value: number): number {
	return value * POINTS_PER_INCH;
}

/** The card sizes the admin can pick, plus a custom escape hatch. */
export const CARD_PRESETS = {
	'5x7': { width: 5, height: 7, label: '5 x 7 in' },
	'4x6': { width: 4, height: 6, label: '4 x 6 in' },
	'a6': { width: 4.13, height: 5.83, label: 'A6 (105 x 148 mm)' },
	'insert-3.5x5': { width: 3.5, height: 5, label: 'QR insert, 3.5 x 5 in' },
	'insert-2.5x3.5': { width: 2.5, height: 3.5, label: 'QR insert, 2.5 x 3.5 in' }
} as const;

export type CardPreset = keyof typeof CARD_PRESETS;

export interface InvitationDetails {
	coupleNames: string;
	dateLine: string;
	timeLine: string;
	venueName: string;
	venueAddress: string;
	siteUrl: string;
}

export interface CardOptions {
	widthIn: number;
	heightIn: number;
	/** 'full' prints the whole invitation; 'insert' is the QR-only companion card. */
	variant: 'full' | 'insert';
}

export const DEFAULT_CARD: CardOptions = { widthIn: 5, heightIn: 7, variant: 'full' };

interface Fonts {
	serif: PDFFont;
	serifBold: PDFFont;
	sans: PDFFont;
}

const INK = rgb(0.1, 0.1, 0.1);
const FAINT = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.85, 0.83, 0.8);

/** Centres a line of text on the page and returns the baseline it used. */
function centreText(
	page: PDFPage,
	text: string,
	font: PDFFont,
	size: number,
	y: number,
	color = INK
): void {
	const width = font.widthOfTextAtSize(text, size);
	page.drawText(text, { x: (page.getWidth() - width) / 2, y, size, font, color });
}

/**
 * Shrinks the type until the line fits the available width.
 *
 * Long venue names and hyphenated surnames are the normal case, not the exception, and
 * a name running off the edge of a printed card is not a defect anyone can fix after
 * the print shop has it.
 */
function fitSize(text: string, font: PDFFont, maxWidth: number, preferred: number, min = 6): number {
	let size = preferred;
	while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
	return size;
}

/** Greedy word wrap, returning the lines that fit `maxWidth` at `size`. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
			current = candidate;
		} else {
			if (current) lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

async function drawFullCard(
	page: PDFPage,
	fonts: Fonts,
	household: Household,
	details: InvitationDetails,
	qrImageBytes: Uint8Array,
	pdf: PDFDocument
): Promise<void> {
	const width = page.getWidth();
	const height = page.getHeight();
	const margin = width * 0.1;
	const inner = width - margin * 2;

	page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });

	// A hairline border set in from the trim, so a slightly off-centre cut at the
	// print shop does not slice through it.
	page.drawRectangle({
		x: margin * 0.55,
		y: margin * 0.55,
		width: width - margin * 1.1,
		height: height - margin * 1.1,
		borderColor: RULE,
		borderWidth: 0.75
	});

	let y = height - margin - 18;

	const eyebrow = 'TOGETHER WITH THEIR FAMILIES';
	const eyebrowSize = fitSize(eyebrow, fonts.sans, inner, 8);
	centreText(page, eyebrow, fonts.sans, eyebrowSize, y, FAINT);

	y -= height * 0.075;
	const nameSize = fitSize(details.coupleNames, fonts.serif, inner, height * 0.055);
	centreText(page, details.coupleNames, fonts.serif, nameSize, y);

	y -= height * 0.042;
	const inviteSize = fitSize('invite you to celebrate their marriage', fonts.sans, inner, 10);
	centreText(page, 'invite you to celebrate their marriage', fonts.sans, inviteSize, y, FAINT);

	y -= height * 0.05;
	page.drawLine({
		start: { x: width / 2 - inner * 0.18, y },
		end: { x: width / 2 + inner * 0.18, y },
		thickness: 0.75,
		color: RULE
	});

	y -= height * 0.05;
	centreText(page, details.dateLine, fonts.serifBold, fitSize(details.dateLine, fonts.serifBold, inner, 15), y);

	if (details.timeLine) {
		y -= height * 0.032;
		centreText(page, details.timeLine, fonts.sans, fitSize(details.timeLine, fonts.sans, inner, 10), y, FAINT);
	}

	y -= height * 0.04;
	centreText(page, details.venueName, fonts.serif, fitSize(details.venueName, fonts.serif, inner, 13), y);

	if (details.venueAddress) {
		y -= height * 0.028;
		for (const line of wrapText(details.venueAddress, fonts.sans, 9, inner)) {
			centreText(page, line, fonts.sans, 9, y, FAINT);
			y -= height * 0.022;
		}
	}

	// The QR block is anchored to the foot of the card rather than flowing after the
	// text, so every invitation in a batch has it in the same place.
	const qrSide = Math.min(width * 0.32, height * 0.22);
	const qrImage = await pdf.embedPng(qrImageBytes);
	const qrY = margin + height * 0.075;

	page.drawImage(qrImage, {
		x: (width - qrSide) / 2,
		y: qrY,
		width: qrSide,
		height: qrSide
	});

	const nameLabel = household.name;
	centreText(page, nameLabel, fonts.serif, fitSize(nameLabel, fonts.serif, inner, 11), qrY + qrSide + 14);

	centreText(page, 'SCAN TO RSVP', fonts.sans, 8, qrY - 14, FAINT);

	const url = rsvpUrl(details.siteUrl, household.token);
	centreText(page, url, fonts.sans, fitSize(url, fonts.sans, inner, 7, 4.5), qrY - 26, FAINT);
}

async function drawInsertCard(
	page: PDFPage,
	fonts: Fonts,
	household: Household,
	details: InvitationDetails,
	qrImageBytes: Uint8Array,
	pdf: PDFDocument
): Promise<void> {
	const width = page.getWidth();
	const height = page.getHeight();
	const margin = width * 0.1;
	const inner = width - margin * 2;

	page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });

	centreText(page, household.name, fonts.serif, fitSize(household.name, fonts.serif, inner, 14), height - margin - 14);

	const qrSide = Math.min(inner, height * 0.45);
	const qrImage = await pdf.embedPng(qrImageBytes);
	const qrY = (height - qrSide) / 2 - height * 0.02;

	page.drawImage(qrImage, { x: (width - qrSide) / 2, y: qrY, width: qrSide, height: qrSide });

	centreText(page, 'SCAN TO RSVP', fonts.sans, 8.5, qrY - 16, FAINT);

	const url = rsvpUrl(details.siteUrl, household.token);
	centreText(page, url, fonts.sans, fitSize(url, fonts.sans, inner, 7, 4.5), qrY - 28, FAINT);

	centreText(page, details.dateLine, fonts.sans, fitSize(details.dateLine, fonts.sans, inner, 8), margin * 0.7, FAINT);
}

/**
 * Renders one PDF containing a page per household.
 *
 * One document for a whole batch is what a print shop wants: it imposes and cuts in
 * one pass rather than opening two hundred files.
 */
export async function buildInvitationPdf(
	households: Household[],
	details: InvitationDetails,
	options: CardOptions = DEFAULT_CARD
): Promise<Uint8Array> {
	const pdf = await PDFDocument.create();
	pdf.setTitle(`${details.coupleNames} -- invitations`);
	pdf.setCreator('wedding-rsvp');

	const fonts: Fonts = {
		serif: await pdf.embedFont(StandardFonts.TimesRoman),
		serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
		sans: await pdf.embedFont(StandardFonts.Helvetica)
	};

	const width = inches(options.widthIn);
	const height = inches(options.heightIn);

	for (const household of households) {
		const page = pdf.addPage([width, height]);
		// 600px at any print size is well past what a 2-inch symbol can resolve, so the
		// QR is never the thing that limits print quality.
		const qr = await qrPng(rsvpUrl(details.siteUrl, household.token), { size: 600, margin: 2 });

		if (options.variant === 'insert') {
			await drawInsertCard(page, fonts, household, details, qr, pdf);
		} else {
			await drawFullCard(page, fonts, household, details, qr, pdf);
		}
	}

	if (households.length === 0) {
		// An empty PDF is invalid; a page saying so is at least openable.
		const page = pdf.addPage([width, height]);
		centreText(page, 'No households selected.', fonts.sans, 12, height / 2, FAINT);
	}

	return pdf.save();
}

/** A single-household PDF, for the preview and the per-guest download. */
export async function buildSingleInvitation(
	household: Household,
	details: InvitationDetails,
	options: CardOptions = DEFAULT_CARD
): Promise<Uint8Array> {
	return buildInvitationPdf([household], details, options);
}
