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

/** One of the couple's own lines, as the layout receives it. */
export interface InvitationExtraLine {
	text: string;
	style: 'display' | 'body' | 'small';
	slot: 'top' | 'middle' | 'bottom';
}

export interface InvitationText {
	eyebrow: string;
	names: string;
	inviteLine: string;
	dateLine: string;
	timeLine: string;
	venueName: string;
	venueAddress: string;
	ceremonyLabel: string;
	receptionName: string;
	receptionAddress: string;
	receptionLabel: string;
	lines: InvitationExtraLine[];
	qrCaption: string;
	householdName: string;
	url: string;
	showUrl: boolean;
	showQr: boolean;
	/**
	 * Whether to reserve room for a photo at the head of the card.
	 *
	 * Set by the caller only when a photo is genuinely available to draw. The layout
	 * cannot check that itself -- it never sees image bytes -- and reserving space for
	 * a photo that then fails to render would leave a hole in the middle of the card.
	 */
	showPhoto: boolean;
	showBorder: boolean;
	photoMode: 'band' | 'background';
	align: 'center' | 'left';
	qrPosition: 'foot' | 'corner';
	/** Multiplier on every type size, and on the gaps between blocks. 1 is shipped. */
	scale: number;
	spacing: number;
	font: 'serif' | 'sans';
	accent: string;
	ink: string;
	background: string;
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
	/**
	 * The anchor, in points from the left of the trim box.
	 *
	 * What it anchors depends on `align`: the centre of the line when centred, its
	 * left edge when ranged left. Both renderers have to agree about that, which is
	 * why it travels with the op rather than being inferred from the card.
	 */
	x: number;
	align: 'center' | 'left';
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
	/**
	 * `card` is the couple's chosen background; `scrim` is that same colour at partial
	 * opacity, laid over a full-bleed photo so the wording stays readable whatever the
	 * picture happens to be doing underneath.
	 */
	fill?: 'card' | 'scrim';
	stroke?: 'rule' | 'accent';
	strokeWidth?: number;
	/** 0-1, for the scrim. Absent means fully opaque. */
	opacity?: number;
}

export interface ImageOp {
	kind: 'image';
	/** Which picture this box is for; the renderers hold two different sources. */
	role: 'qr' | 'photo';
	/**
	 * How the image fills its box.
	 *
	 * A QR is square and generated at the size we asked for, so stretching it to the
	 * box is exact. A photo is whatever shape the couple uploaded, so it is fitted
	 * inside the box and centred -- both renderers do that identically, which is why
	 * the layout does not need to know the image's proportions.
	 */
	fit: 'stretch' | 'contain' | 'cover';
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

/** Keeps a value the couple typed inside the range the layout can actually honour. */
function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.min(max, Math.max(min, value));
}

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

/**
 * One measured line of the card's wording.
 *
 * The body of the invitation is built as a list of these before a single coordinate
 * is decided. That indirection is what makes the card adjustable at all: the couple's
 * own lines, a second venue, a type scale and a left-ranged setting are all just
 * different lists, laid out by the same code, rather than four special cases threaded
 * through one long procedure.
 */
interface FlowLine {
	text: string;
	face: FaceName;
	size: number;
	colour: 'ink' | 'faint' | 'accent';
	/** Space above this line, already scaled. */
	gapBefore: number;
	/** A rule rather than text; `text` is ignored. */
	rule?: boolean;
}

/** The full invitation: everything, with the QR block anchored to the foot. */
function fullCard(text: InvitationText, width: number, height: number, measure: Measure): DrawOp[] {
	const margin = width * 0.1;
	const inner = width - margin * 2;

	// Clamped rather than trusted: these arrive from a form, and a scale of 40 would
	// not produce a bad card so much as an unreadable one.
	const scale = clamp(text.scale, 0.7, 1.5);
	const spacing = clamp(text.spacing, 0.6, 1.8);

	/** A type size at the couple's chosen scale, shrunk again if the line is too wide. */
	const sized = (value: string, face: FaceName, preferred: number, min = 5) =>
		fit(value, face, inner, preferred * scale, measure, min);

	/** A vertical gap at the couple's chosen rhythm. */
	const gap = (fraction: number) => height * fraction * spacing;

	const ops: DrawOp[] = [{ kind: 'rect', x: 0, y: 0, width, height, fill: 'card' }];

	// --- a photo behind everything ------------------------------------------
	// Drawn before the border and the wording, and covered by a scrim, because a
	// photograph is not a background until something has taken the contrast out of it.
	const asBackground = text.showPhoto && text.photoMode === 'background';
	if (asBackground) {
		ops.push({
			kind: 'image',
			role: 'photo',
			// Cover, not contain: a background with white bars down the side is not a
			// background. The renderers crop the overflow.
			fit: 'cover',
			x: 0,
			y: 0,
			width,
			height
		});
		ops.push({ kind: 'rect', x: 0, y: 0, width, height, fill: 'scrim', opacity: 0.72 });
	}

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

	// --- the foot -----------------------------------------------------------
	// Anchored to the bottom rather than flowing after the text, so every card in a
	// batch has its QR in the same place. Laid out first because the wording above has
	// to know where it stops, and so does a photo band.
	//
	// A band photo makes the QR block a little smaller and sets it lower. That is where
	// most of the room for the band comes from -- the card is otherwise full.
	const withBand = text.showPhoto && text.photoMode === 'band';
	const inCorner = text.qrPosition === 'corner';
	const footOps: DrawOp[] = [];
	/** The highest point the foot occupies; nothing above it may descend past this. */
	let footTop: number;

	if (text.showQr && inCorner) {
		// Tucked into the bottom-right, with the household name beside it rather than
		// above. Smaller, because the corner is not where anyone is looking first.
		const side = Math.min(width * 0.2, height * 0.13);
		const qrX = width - margin - side;
		const qrY = margin * 0.9;
		const nameSize = fit(text.householdName, 'display', inner - side - 12, 10 * scale, measure);

		footOps.push({
			kind: 'image',
			role: 'qr',
			fit: 'stretch',
			x: qrX,
			y: qrY,
			width: side,
			height: side
		});

		footOps.push({
			kind: 'text',
			text: text.householdName,
			x: margin,
			align: 'left',
			y: qrY + side / 2,
			size: nameSize,
			face: 'display',
			colour: 'ink'
		});

		if (text.qrCaption) {
			footOps.push({
				kind: 'text',
				text: text.qrCaption,
				x: margin,
				align: 'left',
				y: qrY + side / 2 - nameSize - 4,
				size: 7.5 * scale,
				face: 'body',
				colour: 'accent'
			});
		}

		footTop = qrY + side;
	} else if (text.showQr) {
		const side = Math.min(width * (withBand ? 0.24 : 0.32), height * (withBand ? 0.16 : 0.22));
		const qrY = margin + height * (withBand ? 0.05 : 0.075);
		const nameSize = fit(text.householdName, 'display', inner, (withBand ? 10 : 11) * scale, measure);
		const nameY = qrY + side + 14;

		footOps.push({
			kind: 'image',
			role: 'qr',
			fit: 'stretch',
			x: (width - side) / 2,
			y: qrY,
			width: side,
			height: side
		});

		footOps.push({
			kind: 'text',
			text: text.householdName,
			x: width / 2,
			align: 'center',
			y: nameY,
			size: nameSize,
			face: 'display',
			colour: 'ink'
		});

		if (text.qrCaption) {
			footOps.push({
				kind: 'text',
				text: text.qrCaption,
				x: width / 2,
				align: 'center',
				y: qrY - 14,
				size: 8 * scale,
				face: 'body',
				colour: 'accent'
			});
		}

		if (text.showUrl) {
			footOps.push({
				kind: 'text',
				text: text.url,
				x: width / 2,
				align: 'center',
				y: qrY - 26,
				size: fit(text.url, 'body', inner, 7 * scale, measure, 4.5),
				face: 'body',
				colour: 'faint'
			});
		}

		footTop = nameY + nameSize;
	} else {
		const nameSize = fit(text.householdName, 'display', inner, 12 * scale, measure);
		const nameY = margin + height * 0.1;

		footOps.push({
			kind: 'text',
			text: text.householdName,
			x: width / 2,
			align: 'center',
			y: nameY,
			size: nameSize,
			face: 'display',
			colour: 'ink'
		});

		footTop = nameY + nameSize;
	}

	// --- the wording ----------------------------------------------------------
	// Collected as a list first, then measured, then placed. Nothing here knows where
	// on the card it will end up.
	const flow: FlowLine[] = [];

	/** The couple's own lines for one slot, in the order they wrote them. */
	const extras = (slot: 'top' | 'middle' | 'bottom') => {
		for (const line of text.lines) {
			if (line.slot !== slot || !line.text.trim()) continue;

			const preferred = line.style === 'display' ? 13 : line.style === 'small' ? 8 : 10;
			const face: FaceName = line.style === 'display' ? 'display' : 'body';

			for (const part of wrap(line.text, face, preferred * scale, inner, measure)) {
				flow.push({
					text: part,
					face,
					size: preferred * scale,
					colour: line.style === 'small' ? 'faint' : 'ink',
					gapBefore: gap(line.style === 'display' ? 0.04 : 0.028)
				});
			}
		}
	};

	if (text.eyebrow) {
		flow.push({
			text: text.eyebrow,
			face: 'body',
			size: sized(text.eyebrow, 'body', 8),
			colour: 'accent',
			gapBefore: 0
		});
	}

	extras('top');

	flow.push({
		text: text.names,
		face: 'display',
		size: sized(text.names, 'display', height * 0.055),
		colour: 'ink',
		gapBefore: gap(0.075)
	});

	if (text.inviteLine) {
		flow.push({
			text: text.inviteLine,
			face: 'body',
			size: sized(text.inviteLine, 'body', 10),
			colour: 'faint',
			gapBefore: gap(0.042)
		});
	}

	flow.push({ text: '', face: 'body', size: 0, colour: 'accent', gapBefore: gap(0.05), rule: true });

	if (text.dateLine) {
		flow.push({
			text: text.dateLine,
			face: 'displayBold',
			size: sized(text.dateLine, 'displayBold', 15),
			colour: 'ink',
			gapBefore: gap(0.05)
		});
	}

	if (text.timeLine) {
		flow.push({
			text: text.timeLine,
			face: 'body',
			size: sized(text.timeLine, 'body', 10),
			colour: 'faint',
			gapBefore: gap(0.032)
		});
	}

	extras('middle');

	// --- the venues -----------------------------------------------------------
	// One block when the reception is at the ceremony venue, two when it is not. The
	// labels only appear in the two-venue case: a card that says CEREMONY above its
	// only address is answering a question nobody asked.
	const hasReception = Boolean(text.receptionName.trim() || text.receptionAddress.trim());

	const venueBlock = (label: string, name: string, address: string, first: boolean) => {
		if (!name.trim() && !address.trim()) return;

		if (hasReception && label.trim()) {
			flow.push({
				text: label,
				face: 'body',
				size: sized(label, 'body', 7.5),
				colour: 'accent',
				gapBefore: gap(first ? 0.04 : 0.038)
			});
		}

		if (name.trim()) {
			flow.push({
				text: name,
				face: 'display',
				size: sized(name, 'display', 13),
				colour: 'ink',
				gapBefore: gap(hasReception && label.trim() ? 0.026 : first ? 0.04 : 0.038)
			});
		}

		if (address.trim()) {
			const size = 9 * scale;
			wrap(address, 'body', size, inner, measure).forEach((part, index) => {
				flow.push({
					text: part,
					face: 'body',
					size,
					colour: 'faint',
					gapBefore: index === 0 ? gap(0.028) : gap(0.022)
				});
			});
		}
	};

	venueBlock(text.ceremonyLabel, text.venueName, text.venueAddress, true);
	if (hasReception) {
		venueBlock(text.receptionLabel, text.receptionName, text.receptionAddress, false);
	}

	extras('bottom');

	// --- placing the block, and a photo band above it ---------------------------
	// The gaps, plus the depth of the last line -- which has a gap above it but
	// nothing below, and would otherwise be measured as taking no room at all.
	const blockHeight =
		flow.reduce((total, line) => total + line.gapBefore, 0) + (flow.at(-1)?.size ?? 0);
	/** Where the block's first baseline sits when there is no photo band above it. */
	let top = height - margin - 18;

	if (withBand) {
		const innerTop = height - margin * 0.9;
		const bandGap = height * 0.03;
		// Whatever is left once the wording and the foot have taken their room. The
		// band is sized to fit rather than given a fixed height, because how much of
		// the card the wording uses depends entirely on how much of it was written.
		const room = innerTop - footTop - blockHeight - bandGap * 2;
		const bandHeight = Math.min(room, height * 0.3);

		// Below a tenth of the card a photo is a smear rather than a picture, so a card
		// with no room for one simply does not get one -- printing it over the wording
		// would be worse than leaving it out.
		if (bandHeight >= height * 0.1) {
			ops.push({
				kind: 'image',
				role: 'photo',
				fit: 'contain',
				x: margin,
				y: innerTop - bandHeight,
				width: inner,
				height: bandHeight
			});
			top = innerTop - bandHeight - bandGap;
		}
	}

	const anchor = text.align === 'left' ? margin : width / 2;
	let y = top;

	for (const line of flow) {
		y -= line.gapBefore;

		if (line.rule) {
			// The rule follows the alignment: centred it is a short mark under the
			// names, ranged left it starts at the margin like everything else.
			const length = inner * 0.36;
			ops.push({
				kind: 'line',
				x1: text.align === 'left' ? margin : width / 2 - length / 2,
				y1: y,
				x2: text.align === 'left' ? margin + length : width / 2 + length / 2,
				y2: y,
				width: 0.75,
				colour: 'accent'
			});
			continue;
		}

		ops.push({
			kind: 'text',
			text: line.text,
			x: anchor,
			align: text.align,
			y,
			size: line.size,
			face: line.face,
			colour: line.colour
		});
	}

	ops.push(...footOps);

	return ops;
}

/** The insert card: a name, the QR, and the date. Nothing else. */
function insertCard(text: InvitationText, width: number, height: number, measure: Measure): DrawOp[] {
	const margin = width * 0.1;
	const inner = width - margin * 2;
	const ops: DrawOp[] = [{ kind: 'rect', x: 0, y: 0, width, height, fill: 'card' }];

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
		align: 'center',
		y: height - margin - 14,
		size: fit(text.householdName, 'display', inner, 14, measure),
		face: 'display',
		colour: 'ink'
	});

	const side = Math.min(inner, height * 0.45);
	const qrY = (height - side) / 2 - height * 0.02;

	if (text.showQr) {
		ops.push({
			kind: 'image',
			role: 'qr',
			fit: 'stretch',
			x: (width - side) / 2,
			y: qrY,
			width: side,
			height: side
		});
	}

	if (text.qrCaption) {
		ops.push({
			kind: 'text',
			text: text.qrCaption,
			x: width / 2,
			align: 'center',
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
			align: 'center',
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
			align: 'center',
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
