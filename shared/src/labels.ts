/**
 * Address label sheets, sized to the common Avery templates.
 *
 * The geometry below is Avery's published specification, in inches, converted to
 * points at render time. Getting these numbers exactly right is the whole job: a label
 * sheet that is a sixteenth of an inch out looks fine on screen and prints every
 * address creeping off its label by the bottom row.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { inches } from './invitations';
import type { Household } from './types';

export interface LabelLayout {
	label: string;
	/** Page size in inches. All the supported sheets are US Letter. */
	pageWidth: number;
	pageHeight: number;
	columns: number;
	rows: number;
	labelWidth: number;
	labelHeight: number;
	/** Distance from the page edge to the first label. */
	marginLeft: number;
	marginTop: number;
	/** Gap between adjacent labels; 0 where the labels butt up against each other. */
	gutterX: number;
	gutterY: number;
}

export const LABEL_LAYOUTS = {
	'5160': {
		label: 'Avery 5160 -- 30 per sheet (2.625 x 1 in)',
		pageWidth: 8.5,
		pageHeight: 11,
		columns: 3,
		rows: 10,
		labelWidth: 2.625,
		labelHeight: 1,
		marginLeft: 0.1875,
		marginTop: 0.5,
		gutterX: 0.125,
		gutterY: 0
	},
	'5162': {
		label: 'Avery 5162 -- 14 per sheet (4 x 1.33 in)',
		pageWidth: 8.5,
		pageHeight: 11,
		columns: 2,
		rows: 7,
		labelWidth: 4,
		labelHeight: 1.33,
		marginLeft: 0.1563,
		marginTop: 0.8335,
		gutterX: 0.1875,
		gutterY: 0
	},
	'5163': {
		label: 'Avery 5163 -- 10 per sheet (4 x 2 in)',
		pageWidth: 8.5,
		pageHeight: 11,
		columns: 2,
		rows: 5,
		labelWidth: 4,
		labelHeight: 2,
		marginLeft: 0.1563,
		marginTop: 0.5,
		gutterX: 0.1875,
		gutterY: 0
	},
	'5164': {
		label: 'Avery 5164 -- 6 per sheet (4 x 3.33 in)',
		pageWidth: 8.5,
		pageHeight: 11,
		columns: 2,
		rows: 3,
		labelWidth: 4,
		labelHeight: 3.33,
		marginLeft: 0.1563,
		marginTop: 0.5,
		gutterX: 0.1875,
		gutterY: 0
	}
} as const satisfies Record<string, LabelLayout>;

export type LabelSheet = keyof typeof LABEL_LAYOUTS;

export interface LabelOptions {
	sheet: LabelSheet;
	/** Printed small in the corner of each label when set. */
	returnAddress?: string;
	/** Faint outlines, so a test print can be held against a real sheet. */
	showOutlines?: boolean;
	/** Skip this many label positions, to reuse a part-used sheet. */
	skip?: number;
}

const INK = rgb(0.1, 0.1, 0.1);
const FAINT = rgb(0.55, 0.55, 0.55);
const OUTLINE = rgb(0.88, 0.88, 0.88);

/**
 * Splits a stored address into printable lines.
 *
 * Both real conventions are honoured: a multi-line textarea keeps its own breaks, and
 * a single-line "12 Road, Town, ST 00000" is split on commas so it does not print as
 * one long line running off the label.
 */
export function addressLines(household: Household): string[] {
	const address = household.mailingAddress?.trim();
	const lines = [household.name];

	if (!address) return lines;

	if (address.includes('\n')) {
		lines.push(...address.split('\n').map((line) => line.trim()).filter(Boolean));
	} else {
		lines.push(...address.split(',').map((part) => part.trim()).filter(Boolean));
	}

	return lines;
}

function fitSize(lines: string[], font: PDFFont, maxWidth: number, preferred: number, min = 5): number {
	let size = preferred;
	while (size > min && lines.some((line) => font.widthOfTextAtSize(line, size) > maxWidth)) {
		size -= 0.25;
	}
	return size;
}

/**
 * Renders the label sheets.
 *
 * Households whose address does not fit are still printed, at a reduced size, rather
 * than skipped: a slightly cramped label still reaches its recipient, and a silently
 * missing one does not.
 */
export async function buildLabelPdf(
	households: Household[],
	options: LabelOptions
): Promise<Uint8Array> {
	const layout = LABEL_LAYOUTS[options.sheet] ?? LABEL_LAYOUTS['5160'];
	const pdf = await PDFDocument.create();
	pdf.setTitle('Address labels');
	pdf.setCreator('wedding-rsvp');

	const font = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

	const perPage = layout.columns * layout.rows;
	const skip = Math.max(0, Math.min(options.skip ?? 0, perPage - 1));

	// Leading blanks are modelled as empty slots, so the position arithmetic below
	// never has to know they exist.
	const slots: (Household | null)[] = [...Array<null>(skip).fill(null), ...households];
	const pageCount = Math.max(1, Math.ceil(slots.length / perPage));

	const padX = inches(0.14);
	const padY = inches(0.1);

	for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
		const page = pdf.addPage([inches(layout.pageWidth), inches(layout.pageHeight)]);
		const pageTop = inches(layout.pageHeight);

		for (let slot = 0; slot < perPage; slot += 1) {
			const household = slots[pageIndex * perPage + slot];
			if (!household) continue;

			const column = slot % layout.columns;
			const row = Math.floor(slot / layout.columns);

			const x = inches(layout.marginLeft + column * (layout.labelWidth + layout.gutterX));
			// PDF's origin is bottom-left; label positions are measured from the top.
			const top = pageTop - inches(layout.marginTop + row * (layout.labelHeight + layout.gutterY));
			const labelHeight = inches(layout.labelHeight);
			const labelWidth = inches(layout.labelWidth);

			if (options.showOutlines) {
				page.drawRectangle({
					x,
					y: top - labelHeight,
					width: labelWidth,
					height: labelHeight,
					borderColor: OUTLINE,
					borderWidth: 0.5
				});
			}

			const lines = addressLines(household);
			const usableWidth = labelWidth - padX * 2;
			const returnLine = options.returnAddress?.trim();

			const size = fitSize(lines, font, usableWidth, 10.5);
			const leading = size * 1.28;
			const blockHeight = lines.length * leading + (returnLine ? size * 0.9 : 0);

			// Vertically centred in the label, so a two-line and a four-line address
			// both sit correctly on the same sheet.
			let cursor = top - (labelHeight - blockHeight) / 2 - size;

			if (returnLine) {
				page.drawText(returnLine.replace(/\s*\n\s*/g, ' '), {
					x: x + padX,
					y: top - padY - size * 0.75,
					size: Math.max(5, size * 0.62),
					font,
					color: FAINT
				});
				cursor -= size * 0.5;
			}

			lines.forEach((line, index) => {
				page.drawText(line, {
					x: x + padX,
					y: cursor,
					size,
					font: index === 0 ? bold : font,
					color: INK,
					maxWidth: usableWidth
				});
				cursor -= leading;
			});
		}
	}

	return pdf.save();
}
