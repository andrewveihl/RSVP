/**
 * Where every element on an invitation goes.
 *
 * This module decides the layout and nothing else: it produces a list of draw
 * operations in PDF coordinates, and two renderers consume them -- `invitations.ts`
 * writes them with pdf-lib, and `invitation-svg.ts` writes the same list as SVG for the
 * live preview in the admin.
 *
 * That split is the whole point. A preview built independently in HTML would drift from
 * the PDF the moment either changed, and the drift would only ever be discovered after
 * something was printed. Here the preview cannot disagree about position or size,
 * because it is reading the same numbers.
 *
 * Text metrics come from the caller, because only the PDF side has real font metrics.
 * The SVG renderer passes an approximation built from the same standard fonts, which is
 * close enough for a preview and never used to decide what is printed.
 */

export const POINTS_PER_INCH = 72;

export function inches(value: number): number {
	return value * POINTS_PER_INCH;
}

export interface InvitationText {
	eyebrow: string;
	names: string;
	inviteLine: string;
	dateLine: string;
	timeLine: string;
	venueName: string;
	venueAddress: string;
	qrCaption: string;
	householdName: string;
	url: string;
	showUrl: boolean;
	showQr: boolean;
	showBorder: boolean;
	font: 'serif' | 'sans';
	accent: string;
}

export interface CardGeometry {
	widthIn: number;
	heightIn: number;
	variant: 'full' | 'insert';
	/** Extra margin outside the trim, in inches, for a print shop. */
	bleedIn?: number;
	showCropMarks?: boolean;
}

/** Which of the three embedded faces a piece of text is set in. */
export type FaceName = 'display' | 'displayBold' | 'body';

export interface TextOp {
	kind: 'text';
	text: string;
	/** Centre point, in points from the left of the trim box. */
	x: number;
	/** Baseline, in points from the *bottom* of the trim box -- PDF's origin. */
	y: number;
	size: number;
	face: FaceName;
	colour: 'ink' | 'faint' | 'accent';
}

export interface LineOp {
	kind: 'line';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	width: number;
	colour: 'rule' | 'accent' | 'crop';
}

export interface RectOp {
	kind: 'rect';
	x: number;
	y: number;
	width: number;
	height: number;
	fill?: 'white';
	stroke?: 'rule' | 'accent';
	strokeWidth?: number;
}

export interface ImageOp {
	kind: 'image';
	x: number;
	y: number;
	width: number;
	height: number;
}

export type DrawOp = TextOp | LineOp | RectOp | ImageOp;

export interface Layout {
	/** Trim size, in points. */
	width: number;
	height: number;
	/** Full media size including bleed, in points. */
	mediaWidth: number;
	mediaHeight: number;
	/** Offset of the trim box inside the media box. */
	offsetX: number;
	offsetY: number;
	ops: DrawOp[];
}

/** Measures a string; supplied by whichever renderer is driving the layout. */
export type Measure = (text: string, face: FaceName, size: number) => number;

/** Shrinks the type until the line fits, so a long name never runs off the card. */
function fit(
	text: string,
	face: FaceName,
	maxWidth: number,
	preferred: number,
	measure: Measure,
	min = 5
): number {
	let size = preferred;
	while (size > min && measure(text, face, size) > maxWidth) size -= 0.5;
	return size;
}

/** Greedy word wrap at a fixed size. */
function wrap(text: string, face: FaceName, size: number, maxWidth: number, measure: Measure): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (measure(candidate, face, size) <= maxWidth) current = candidate;
		else {
			if (current) lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

/**
 * Crop marks: four corner pairs sitting in the bleed, clear of the trim.
 *
 * Only drawn when there is bleed to draw them in -- marks printed inside the trim would
 * be cut through and show on the finished card.
 */
function cropMarks(layout: Omit<Layout, 'ops'>): LineOp[] {
	const { offsetX: x, offsetY: y, width, height } = layout;
	if (x < 4 || y < 4) return [];

	const length = Math.min(x, y) * 0.7;
	const gap = 2;
	const marks: LineOp[] = [];

	const corner = (cx: number, cy: number, dx: number, dy: number) => {
		marks.push({
			kind: 'line',
			x1: cx + dx * gap,
			y1: cy,
			x2: cx + dx * (gap + length),
			y2: cy,
			width: 0.25,
			colour: 'crop'
		});
		marks.push({
			kind: 'line',
			x1: cx,
			y1: cy + dy * gap,
			x2: cx,
			y2: cy + dy * (gap + length),
			width: 0.25,
			colour: 'crop'
		});
	};

	// Coordinates are relative to the trim box, so the corners are its four extremes.
	corner(0, 0, -1, -1);
	corner(width, 0, 1, -1);
	corner(0, height, -1, 1);
	corner(width, height, 1, 1);

	return marks;
}

/** The full invitation: everything, with the QR block anchored to the foot. */
function fullCard(text: InvitationText, width: number, height: number, measure: Measure): DrawOp[] {
	const margin = width * 0.1;
	const inner = width - margin * 2;
	const ops: DrawOp[] = [{ kind: 'rect', x: 0, y: 0, width, height, fill: 'white' }];

	if (text.showBorder) {
		// Set in from the trim, so a slightly off-centre cut does not slice through it.
		ops.push({
			kind: 'rect',
			x: margin * 0.55,
			y: margin * 0.55,
			width: width - margin * 1.1,
			height: height - margin * 1.1,
			stroke: 'accent',
			strokeWidth: 0.75
		});
	}

	let y = height - margin - 18;

	if (text.eyebrow) {
		ops.push({
			kind: 'text',
			text: text.eyebrow,
			x: width / 2,
			y,
			size: fit(text.eyebrow, 'body', inner, 8, measure),
			face: 'body',
			colour: 'accent'
		});
	}

	y -= height * 0.075;
	ops.push({
		kind: 'text',
		text: text.names,
		x: width / 2,
		y,
		size: fit(text.names, 'display', inner, height * 0.055, measure),
		face: 'display',
		colour: 'ink'
	});

	if (text.inviteLine) {
		y -= height * 0.042;
		ops.push({
			kind: 'text',
			text: text.inviteLine,
			x: width / 2,
			y,
			size: fit(text.inviteLine, 'body', inner, 10, measure),
			face: 'body',
			colour: 'faint'
		});
	}

	y -= height * 0.05;
	ops.push({
		kind: 'line',
		x1: width / 2 - inner * 0.18,
		y1: y,
		x2: width / 2 + inner * 0.18,
		y2: y,
		width: 0.75,
		colour: 'accent'
	});

	if (text.dateLine) {
		y -= height * 0.05;
		ops.push({
			kind: 'text',
			text: text.dateLine,
			x: width / 2,
			y,
			size: fit(text.dateLine, 'displayBold', inner, 15, measure),
			face: 'displayBold',
			colour: 'ink'
		});
	}

	if (text.timeLine) {
		y -= height * 0.032;
		ops.push({
			kind: 'text',
			text: text.timeLine,
			x: width / 2,
			y,
			size: fit(text.timeLine, 'body', inner, 10, measure),
			face: 'body',
			colour: 'faint'
		});
	}

	if (text.venueName) {
		y -= height * 0.04;
		ops.push({
			kind: 'text',
			text: text.venueName,
			x: width / 2,
			y,
			size: fit(text.venueName, 'display', inner, 13, measure),
			face: 'display',
			colour: 'ink'
		});
	}

	if (text.venueAddress) {
		y -= height * 0.028;
		for (const line of wrap(text.venueAddress, 'body', 9, inner, measure)) {
			ops.push({ kind: 'text', text: line, x: width / 2, y, size: 9, face: 'body', colour: 'faint' });
			y -= height * 0.022;
		}
	}

	// Anchored to the foot rather than flowing after the text, so every card in a batch
	// has its QR in the same place.
	if (text.showQr) {
		const side = Math.min(width * 0.32, height * 0.22);
		const qrY = margin + height * 0.075;

		ops.push({ kind: 'image', x: (width - side) / 2, y: qrY, width: side, height: side });

		ops.push({
			kind: 'text',
			text: text.householdName,
			x: width / 2,
			y: qrY + side + 14,
			size: fit(text.householdName, 'display', inner, 11, measure),
			face: 'display',
			colour: 'ink'
		});

		if (text.qrCaption) {
			ops.push({
				kind: 'text',
				text: text.qrCaption,
				x: width / 2,
				y: qrY - 14,
				size: 8,
				face: 'body',
				colour: 'accent'
			});
		}

		if (text.showUrl) {
			ops.push({
				kind: 'text',
				text: text.url,
				x: width / 2,
				y: qrY - 26,
				size: fit(text.url, 'body', inner, 7, measure, 4.5),
				face: 'body',
				colour: 'faint'
			});
		}
	} else {
		ops.push({
			kind: 'text',
			text: text.householdName,
			x: width / 2,
			y: margin + height * 0.1,
			size: fit(text.householdName, 'display', inner, 12, measure),
			face: 'display',
			colour: 'ink'
		});
	}

	return ops;
}

/** The insert card: a name, the QR, and the date. Nothing else. */
function insertCard(text: InvitationText, width: number, height: number, measure: Measure): DrawOp[] {
	const margin = width * 0.1;
	const inner = width - margin * 2;
	const ops: DrawOp[] = [{ kind: 'rect', x: 0, y: 0, width, height, fill: 'white' }];

	if (text.showBorder) {
		ops.push({
			kind: 'rect',
			x: margin * 0.5,
			y: margin * 0.5,
			width: width - margin,
			height: height - margin,
			stroke: 'accent',
			strokeWidth: 0.5
		});
	}

	ops.push({
		kind: 'text',
		text: text.householdName,
		x: width / 2,
		y: height - margin - 14,
		size: fit(text.householdName, 'display', inner, 14, measure),
		face: 'display',
		colour: 'ink'
	});

	const side = Math.min(inner, height * 0.45);
	const qrY = (height - side) / 2 - height * 0.02;

	if (text.showQr) {
		ops.push({ kind: 'image', x: (width - side) / 2, y: qrY, width: side, height: side });
	}

	if (text.qrCaption) {
		ops.push({
			kind: 'text',
			text: text.qrCaption,
			x: width / 2,
			y: qrY - 16,
			size: 8.5,
			face: 'body',
			colour: 'accent'
		});
	}

	if (text.showUrl) {
		ops.push({
			kind: 'text',
			text: text.url,
			x: width / 2,
			y: qrY - 28,
			size: fit(text.url, 'body', inner, 7, measure, 4.5),
			face: 'body',
			colour: 'faint'
		});
	}

	if (text.dateLine) {
		ops.push({
			kind: 'text',
			text: text.dateLine,
			x: width / 2,
			y: margin * 0.7,
			size: fit(text.dateLine, 'body', inner, 8, measure),
			face: 'body',
			colour: 'faint'
		});
	}

	return ops;
}

export function layoutCard(
	text: InvitationText,
	geometry: CardGeometry,
	measure: Measure
): Layout {
	const width = inches(geometry.widthIn);
	const height = inches(geometry.heightIn);
	const bleed = inches(geometry.bleedIn ?? 0);

	const base = {
		width,
		height,
		mediaWidth: width + bleed * 2,
		mediaHeight: height + bleed * 2,
		offsetX: bleed,
		offsetY: bleed
	};

	const ops =
		geometry.variant === 'insert'
			? insertCard(text, width, height, measure)
			: fullCard(text, width, height, measure);

	if (geometry.showCropMarks && bleed > 0) ops.push(...cropMarks(base));

	return { ...base, ops };
}
