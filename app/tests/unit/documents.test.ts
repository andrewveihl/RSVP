import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { dropDatabase, freshDatabase, makeHousehold } from './helpers';
import { buildInvitationPdf, buildSingleInvitation, inches, CARD_PRESETS } from '$shared/invitations';
import { addressLines, buildLabelPdf, LABEL_LAYOUTS } from '$shared/labels';
import { qrPng, qrSvg, qrDataUrl } from '$shared/qr';
import { createZip, safeEntryName } from '$shared/zip';
import { crc32 } from '$shared/crc32';
import { invitationSvg, previewMeasure } from '$shared/invitation-svg';
import { layoutCard, type ImageOp, type TextOp } from '$shared/invitation-layout';
import { invitationTextFor } from '$shared/invitations';
import { defaultSiteContent } from '$shared/defaults';
import type { InvitationContent } from '$shared/types';

const SITE = 'https://rsvp.example.com';

const invitation: InvitationContent = {
	...defaultSiteContent().invitation,
	names: 'Andrew & Madeline',
	dateLine: 'Saturday, May 29, 2027',
	timeLine: 'Four in the afternoon',
	venueName: 'The Old Barn',
	venueAddress: '12 Long Lane, Somewhere, ST 00000'
};

beforeEach(freshDatabase);
afterEach(dropDatabase);

/**
 * Reads the generated file back with the same library that wrote it.
 *
 * Grepping the bytes for `/Type /Page` would not work: pdf-lib packs objects into
 * compressed streams, so the structure is not there as plain text. Loading it also
 * proves the output actually parses as a PDF, which is the thing worth asserting.
 */
async function pdfPageCount(bytes: Uint8Array): Promise<number> {
	const document = await PDFDocument.load(bytes);
	return document.getPageCount();
}

describe('invitations', () => {
	it('converts inches to points', () => {
		expect(inches(5)).toBe(360);
		expect(inches(0.5)).toBe(36);
	});

	it('produces a valid PDF with a page per household', async () => {
		const households = [makeHousehold({ name: 'A' }), makeHousehold({ name: 'B' }), makeHousehold({ name: 'C' })];

		const pdf = await buildInvitationPdf(households, invitation, SITE, { widthIn: 5, heightIn: 7, variant: 'full' });

		expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
		expect(await pdfPageCount(pdf)).toBe(3);
	});

	it('renders the insert variant', async () => {
		const household = makeHousehold();
		const pdf = await buildSingleInvitation(household, invitation, SITE, {
			widthIn: CARD_PRESETS['insert-2.5x3.5'].width,
			heightIn: CARD_PRESETS['insert-2.5x3.5'].height,
			variant: 'insert'
		});

		expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
		expect(await pdfPageCount(pdf)).toBe(1);
	});

	it('still produces an openable file when nothing is selected', async () => {
		// An empty PDF is not a valid PDF; a page saying so at least opens.
		const pdf = await buildInvitationPdf([], invitation, SITE, { widthIn: 5, heightIn: 7, variant: 'full' });
		expect(await pdfPageCount(pdf)).toBe(1);
	});

	/**
	 * The layout tests prove where things go; this proves pdf-lib will actually write
	 * them. The two are different failures -- a `cover` image and a scrim opacity are
	 * numbers the layout is happy to emit and the PDF writer could still refuse.
	 */
	it('writes a card with every option turned on', async () => {
		// A 1x1 PNG is enough: the point is that the writer accepts the operations, not
		// what the picture looks like.
		const png = await qrPng('https://example.com', { size: 64 });

		const pdf = await buildSingleInvitation(
			makeHousehold({ name: 'The Whitfields' }),
			{
				...invitation,
				receptionName: 'The Old Barn',
				receptionAddress: '40 Mill Road, Somewhere',
				lines: [
					{ id: 'a', text: 'Black tie optional', style: 'small', slot: 'bottom' },
					{ id: 'b', text: 'Reception to follow', style: 'display', slot: 'middle' }
				],
				showPhoto: true,
				photoMode: 'background',
				align: 'left',
				qrPosition: 'corner',
				scale: 1.3,
				spacing: 1.4,
				ink: '#26343F',
				background: '#FBF7F0'
			},
			SITE,
			{ widthIn: 5, heightIn: 7, variant: 'full', bleedIn: 0.125, showCropMarks: true },
			{ data: png, mimetype: 'image/png' }
		);

		expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
		expect(await pdfPageCount(pdf)).toBe(1);
	});

	it('survives absurdly long names without throwing', async () => {
		const household = makeHousehold({ name: 'The '.repeat(60) + 'Family' });
		const pdf = await buildSingleInvitation(household, invitation, SITE, {
			widthIn: 4,
			heightIn: 6,
			variant: 'full'
		});
		expect(await pdfPageCount(pdf)).toBe(1);
	});
});

describe('address labels', () => {
	it('splits a single-line address on commas', () => {
		const household = makeHousehold({
			name: 'The Smiths',
			mailingAddress: '12 Long Lane, Somewhere, ST 00000'
		});

		expect(addressLines(household)).toEqual(['The Smiths', '12 Long Lane', 'Somewhere', 'ST 00000']);
	});

	it('keeps the author’s own line breaks when there are any', () => {
		const household = makeHousehold({
			name: 'The Smiths',
			mailingAddress: '12 Long Lane\nSomewhere\nST 00000'
		});

		expect(addressLines(household)).toEqual(['The Smiths', '12 Long Lane', 'Somewhere', 'ST 00000']);
	});

	it('falls back to just the name when there is no address', () => {
		expect(addressLines(makeHousehold({ name: 'The Smiths' }))).toEqual(['The Smiths']);
	});

	it('fills one sheet per page-worth of labels', async () => {
		const layout = LABEL_LAYOUTS['5160'];
		const perSheet = layout.columns * layout.rows; // 30

		const households = Array.from({ length: perSheet + 1 }, (_, index) =>
			makeHousehold({ name: `Family ${index}`, mailingAddress: '1 Road, Town, ST 00000' })
		);

		const pdf = await buildLabelPdf(households, { sheet: '5160' });
		expect(await pdfPageCount(pdf)).toBe(2);
	});

	it('honours a skip count when reusing a part-used sheet', async () => {
		const households = Array.from({ length: 2 }, (_, index) =>
			makeHousehold({ name: `Family ${index}`, mailingAddress: '1 Road, Town' })
		);

		// 29 skipped + 2 labels overflows the 30-label sheet onto a second page.
		const pdf = await buildLabelPdf(households, { sheet: '5160', skip: 29 });
		expect(await pdfPageCount(pdf)).toBe(2);
	});

	it('always emits at least one page', async () => {
		const pdf = await buildLabelPdf([], { sheet: '5163' });
		expect(await pdfPageCount(pdf)).toBe(1);
	});
});

describe('QR codes', () => {
	it('renders a PNG with the right magic bytes', async () => {
		const png = await qrPng('https://rsvp.example.com/rsvp/abc');
		expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	});

	it('renders an SVG', async () => {
		const svg = await qrSvg('https://rsvp.example.com/rsvp/abc');
		expect(svg).toContain('<svg');
		expect(svg).toContain('viewBox');
	});

	it('renders a data URL the admin CSP will accept', async () => {
		const url = await qrDataUrl('https://rsvp.example.com/rsvp/abc');
		expect(url.startsWith('data:image/png;base64,')).toBe(true);
	});

	it('makes a bigger symbol at a higher error-correction level', async () => {
		const low = await qrPng('https://rsvp.example.com/rsvp/abcdefghijklmnop', {
			size: 400,
			errorCorrectionLevel: 'L'
		});
		const high = await qrPng('https://rsvp.example.com/rsvp/abcdefghijklmnop', {
			size: 400,
			errorCorrectionLevel: 'H'
		});
		// Same pixel size, more modules -- so more detail and a larger file.
		expect(high.length).toBeGreaterThan(low.length);
	});
});

describe('zip writer', () => {
	it('computes the standard CRC-32', () => {
		// The reference value for "123456789" under IEEE 802.3.
		expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array())).toBe(0);
	});

	it('writes a recognisable archive', () => {
		const zip = createZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]);

		expect([...zip.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
		// The end-of-central-directory record closes the file.
		expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
		expect(zip.readUInt16LE(zip.length - 14)).toBe(1);
		expect(zip.toString('latin1')).toContain('hello');
	});

	it('records every entry in the central directory', () => {
		const zip = createZip([
			{ name: 'a.txt', data: new TextEncoder().encode('one') },
			{ name: 'b.txt', data: new TextEncoder().encode('two') }
		]);

		expect(zip.readUInt16LE(zip.length - 14)).toBe(2);
	});

	it('makes entry names safe', () => {
		expect(safeEntryName('The Smith Family', 'pdf')).toBe('The Smith Family.pdf');
		expect(safeEntryName('../../etc/passwd', 'pdf')).toBe('etc-passwd.pdf');
		expect(safeEntryName('a/b\\c:d*e?f"g<h>i|j', 'png')).toBe('a-b-c-d-e-f-g-h-i-j.png');
		expect(safeEntryName('   ', 'pdf')).toBe('invitation.pdf');
	});
});

describe('the invitation layout, shared by the PDF and the preview', () => {
	/**
	 * The preview's whole value is that it cannot disagree with the print. These pin
	 * that down: same layout module, same numbers, whichever renderer consumes them.
	 */
	const text = () =>
		invitationTextFor(invitation, makeHousehold({ name: 'The Whitfields' }), SITE);

	it('places the same operations regardless of who draws them', () => {
		const geometry = { widthIn: 5, heightIn: 7, variant: 'full' as const };
		// One card's text, laid out twice -- a fresh household each time would carry a
		// fresh token, and the URLs would differ for reasons that are not the layout's.
		const card = text();
		const measure = (value: string, _face: string, size: number) => value.length * size * 0.5;

		const a = layoutCard(card, geometry, measure as never);
		const b = layoutCard(card, geometry, measure as never);

		// Deterministic: the same input yields byte-identical geometry, which is what
		// lets the SVG preview stand in for the PDF.
		expect(JSON.stringify(a.ops)).toBe(JSON.stringify(b.ops));
	});

	it('puts the trim box inside a larger media box when there is bleed', () => {
		const plain = layoutCard(text(), { widthIn: 5, heightIn: 7, variant: 'full' }, previewMeasure);
		const press = layoutCard(
			text(),
			{ widthIn: 5, heightIn: 7, variant: 'full', bleedIn: 0.125, showCropMarks: true },
			previewMeasure
		);

		expect(plain.mediaWidth).toBe(plain.width);
		expect(plain.offsetX).toBe(0);

		// 0.125in on each edge, at 72 points to the inch.
		expect(press.mediaWidth).toBe(press.width + 18);
		expect(press.offsetX).toBe(9);
	});

	it('draws crop marks only when there is bleed to draw them in', () => {
		const marks = (options: Parameters<typeof layoutCard>[1]) =>
			layoutCard(text(), options, previewMeasure).ops.filter(
				(op) => op.kind === 'line' && op.colour === 'crop'
			).length;

		// Inside the trim they would be cut through and show on the finished card.
		expect(marks({ widthIn: 5, heightIn: 7, variant: 'full', showCropMarks: true })).toBe(0);
		// Four corners, two marks each.
		expect(
			marks({ widthIn: 5, heightIn: 7, variant: 'full', bleedIn: 0.125, showCropMarks: true })
		).toBe(8);
	});

	it('honours the toggles', () => {
		const kinds = (overrides: Partial<ReturnType<typeof text>>) => {
			const ops = layoutCard(
				{ ...text(), ...overrides },
				{ widthIn: 5, heightIn: 7, variant: 'full' },
				previewMeasure
			).ops;
			return {
				images: ops.filter((op) => op.kind === 'image').length,
				borders: ops.filter((op) => op.kind === 'rect' && op.stroke).length,
				texts: ops.filter((op) => op.kind === 'text').map((op) => (op as { text: string }).text)
			};
		};

		expect(kinds({}).images).toBe(1);
		expect(kinds({ showQr: false }).images).toBe(0);
		expect(kinds({ showBorder: false }).borders).toBe(0);
		expect(kinds({ showUrl: false }).texts).not.toContain(text().url);

		// With the QR gone the household is still named -- otherwise the card would not
		// say who it is for at all.
		expect(kinds({ showQr: false }).texts).toContain('The Whitfields');
	});

	describe('the photo', () => {
		const geometry = { widthIn: 5, heightIn: 7, variant: 'full' as const };
		const ops = (showPhoto: boolean) =>
			layoutCard({ ...text(), showPhoto }, geometry, previewMeasure).ops;

		const imageOps = (showPhoto: boolean, role: 'qr' | 'photo') =>
			ops(showPhoto).filter((op): op is ImageOp => op.kind === 'image' && op.role === role);

		const textOps = (showPhoto: boolean) =>
			ops(showPhoto).filter((op): op is TextOp => op.kind === 'text');

		it('adds nothing at all when there is no photo', () => {
			expect(imageOps(false, 'photo')).toHaveLength(0);
			// And the QR is still the one image on the card.
			expect(imageOps(false, 'qr')).toHaveLength(1);
		});

		it('places it across the head of the card, fitted rather than stretched', () => {
			const [photo] = imageOps(true, 'photo');

			expect(photo).toBeDefined();
			expect(photo.fit).toBe('contain');
			// Full width inside the margins, and sitting inside a 7in (504pt) card.
			expect(photo.width).toBeCloseTo(288, 5);
			expect(photo.height).toBeGreaterThan(0);
			expect(photo.y + photo.height).toBeLessThanOrEqual(504);
		});

		it('leaves the QR stretched, because it is square and generated to size', () => {
			expect(imageOps(true, 'qr')[0].fit).toBe('stretch');
		});

		/**
		 * The card is otherwise full, so the photo has to take its space from somewhere.
		 * What it must never take it from is the wording -- an invitation with the venue
		 * printed across the couple's own faces is worse than one with no photo at all.
		 */
		it('never overlaps the wording', () => {
			const [photo] = imageOps(true, 'photo');
			const highestText = Math.max(...textOps(true).map((op) => op.y + op.size));

			expect(highestText).toBeLessThanOrEqual(photo.y);
		});

		/**
		 * The other half of the same invariant, at the bottom of the card. The wording
		 * must clear the foot block, not just the photo -- squeezing a photo in above by
		 * pushing the venue down onto the QR would be no better.
		 */
		it('keeps the wording clear of the foot', () => {
			// One card, laid out once: a fresh household would carry a fresh token, and
			// the URL is one of the strings this has to tell apart.
			const card = { ...text(), showPhoto: true };
			const laid = layoutCard(card, geometry, previewMeasure).ops;
			const texts = laid.filter((op): op is TextOp => op.kind === 'text');

			// The foot is exactly these three; everything else came from the flow.
			const isFoot = (op: TextOp) =>
				op.text === card.householdName || op.text === card.qrCaption || op.text === card.url;

			const foot = texts.filter(isFoot);
			const flow = texts.filter((op) => !isFoot(op));

			expect(foot.length).toBeGreaterThan(0);
			expect(flow.length).toBeGreaterThan(0);

			const footTop = Math.max(...foot.map((op) => op.y + op.size));
			expect(Math.min(...flow.map((op) => op.y))).toBeGreaterThan(footTop);
		});

		/**
		 * The regression that matters most: a couple who never add a photo must get the
		 * same card they were printing before the feature existed.
		 */
		it('does not move anything on a card with the photo off', () => {
			const first = textOps(false)[0];
			// 7in card, 0.5in margin, less the 18pt the first line has always sat at.
			expect(first.y).toBeCloseTo(504 - 36 - 18, 5);
		});
	});

	it('shrinks a long line rather than letting it run off the card', () => {
		const long = { ...text(), names: 'Alexandrina & Bartholomew Featherstonehaugh-Cholmondeley' };
		const shortNames = layoutCard(text(), { widthIn: 5, heightIn: 7, variant: 'full' }, previewMeasure);
		const longNames = layoutCard(long, { widthIn: 5, heightIn: 7, variant: 'full' }, previewMeasure);

		const sizeOf = (layout: typeof shortNames, needle: string) =>
			(layout.ops.find((op) => op.kind === 'text' && (op as { text: string }).text === needle) as
				| { size: number }
				| undefined)?.size ?? 0;

		expect(sizeOf(longNames, long.names)).toBeLessThan(sizeOf(shortNames, text().names));
	});
});

describe('what the couple can change about the card', () => {
	const geometry = { widthIn: 5, heightIn: 7, variant: 'full' as const };

	/**
	 * One card's text. Two calls would carry two tokens, and therefore two different
	 * printed URLs -- which is not a difference any of these tests is about.
	 */
	const base = () => invitationTextFor(invitation, makeHousehold({ name: 'The Whitfields' }), SITE);

	/** The card laid out with `overrides` applied to the shipped invitation. */
	const laid = (
		overrides: Partial<ReturnType<typeof invitationTextFor>>,
		from: ReturnType<typeof invitationTextFor> = base()
	) => layoutCard({ ...from, ...overrides }, geometry, previewMeasure).ops;

	const texts = (ops: ReturnType<typeof laid>) =>
		ops.filter((op): op is TextOp => op.kind === 'text').map((op) => op.text);

	describe('a reception somewhere else', () => {
		it('says nothing about a ceremony when there is only one venue', () => {
			// The shipped card carries a ceremony label, but with a single address there
			// is nothing to tell apart, so it must not be printed.
			expect(texts(laid({}))).not.toContain('CEREMONY');
			expect(texts(laid({}))).not.toContain('RECEPTION');
		});

		it('labels both once a reception address is given', () => {
			const printed = texts(
				laid({ receptionName: 'The Old Barn', receptionAddress: '40 Mill Road' })
			);

			expect(printed).toContain('CEREMONY');
			expect(printed).toContain('RECEPTION');
			expect(printed).toContain('The Old Barn');
			// And the ceremony venue is still there, above it.
			expect(printed.indexOf('CEREMONY')).toBeLessThan(printed.indexOf('RECEPTION'));
		});

		it('drops a label the couple cleared, keeping the venue', () => {
			const printed = texts(
				laid({ receptionName: 'The Old Barn', receptionLabel: '', ceremonyLabel: '' })
			);

			expect(printed).not.toContain('CEREMONY');
			expect(printed).toContain('The Old Barn');
		});
	});

	/**
	 * `mergeSection` fills in missing top-level keys but never looks inside an array,
	 * so nothing has vouched for the contents of `lines`. Getting this wrong on a
	 * member of the wedding party once took a whole guest page down.
	 */
	it('does not throw on a stored document full of nonsense', () => {
		const broken = {
			lines: [null, {}, { text: 42 }, 'not an object', { text: 'Fine', slot: 'bottom' }],
			receptionName: null,
			receptionAddress: undefined,
			ceremonyLabel: null,
			venueName: null
		} as unknown as Partial<ReturnType<typeof invitationTextFor>>;

		expect(() => laid(broken)).not.toThrow();
		// And the one usable line still makes it onto the card.
		expect(texts(laid(broken))).toContain('Fine');
	});

	it('does not throw when lines is not an array at all', () => {
		const broken = { lines: 'nope' } as unknown as Partial<ReturnType<typeof invitationTextFor>>;
		expect(() => laid(broken)).not.toThrow();
	});

	describe('the couple’s own lines', () => {
		const line = (text: string, slot: 'top' | 'middle' | 'bottom') => ({
			text,
			style: 'body' as const,
			slot
		});

		it('places each line in the slot it was given', () => {
			const printed = texts(
				laid({ lines: [line('At the end', 'bottom'), line('Near the top', 'top')] })
			);

			// Written bottom-first, but printed in slot order rather than array order.
			expect(printed.indexOf('Near the top')).toBeLessThan(printed.indexOf('At the end'));
			// And the top line still sits below the eyebrow it was placed under.
			expect(printed.indexOf(invitation.eyebrow)).toBeLessThan(printed.indexOf('Near the top'));
		});

		it('ignores a line with nothing in it', () => {
			const from = base();
			expect(texts(laid({ lines: [line('   ', 'bottom')] }, from))).toEqual(texts(laid({}, from)));
		});

		it('wraps a long line rather than running it off the card', () => {
			const long = 'Carriages at midnight and a bus back to the village hall for anyone staying';
			const from = base();

			const without = texts(laid({}, from));
			const added = texts(laid({ lines: [line(long, 'bottom')] }, from)).filter(
				(text) => !without.includes(text)
			);

			// Broken across several lines...
			expect(added.length).toBeGreaterThan(1);
			// ...and every word survives the break.
			expect(added.join(' ')).toBe(long);
		});
	});

	describe('type size and spacing', () => {
		it('scales the type without moving the first line', () => {
			const plain = laid({}).filter((op): op is TextOp => op.kind === 'text');
			const big = laid({ scale: 1.4 }).filter((op): op is TextOp => op.kind === 'text');

			expect(big[0].size).toBeGreaterThan(plain[0].size);
			// The block still starts where it always did; only what fills it changes.
			expect(big[0].y).toBeCloseTo(plain[0].y, 5);
		});

		it('opens the gaps without changing the type', () => {
			const plain = laid({}).filter((op): op is TextOp => op.kind === 'text');
			const airy = laid({ spacing: 1.6 }).filter((op): op is TextOp => op.kind === 'text');

			expect(airy[0].size).toBeCloseTo(plain[0].size, 5);
			// Same first baseline, but the second line has moved further down.
			expect(airy[1].y).toBeLessThan(plain[1].y);
		});

		it('refuses a value that would make the card unreadable', () => {
			const absurd = laid({ scale: 40 }).filter((op): op is TextOp => op.kind === 'text');
			const capped = laid({ scale: 1.5 }).filter((op): op is TextOp => op.kind === 'text');

			expect(absurd[0].size).toBeCloseTo(capped[0].size, 5);
		});
	});

	describe('alignment', () => {
		it('centres every line by default', () => {
			const ops = laid({}).filter((op): op is TextOp => op.kind === 'text');
			expect(ops.every((op) => op.align === 'center')).toBe(true);
		});

		it('ranges the wording left, and the rule with it', () => {
			const ops = laid({ align: 'left' });
			const body = ops.filter((op): op is TextOp => op.kind === 'text' && op.align === 'left');
			const rule = ops.find((op) => op.kind === 'line');

			expect(body.length).toBeGreaterThan(0);
			// 5in card, 10% margin: everything starts at the same left edge.
			expect(body.every((op) => Math.abs(op.x - 36) < 0.001)).toBe(true);
			expect(rule && rule.kind === 'line' ? rule.x1 : -1).toBeCloseTo(36, 5);
		});
	});

	describe('a photo behind the whole card', () => {
		it('covers the card and lays a scrim over it before any wording', () => {
			const ops = laid({ showPhoto: true, photoMode: 'background' });

			const photoAt = ops.findIndex((op) => op.kind === 'image' && op.role === 'photo');
			const scrimAt = ops.findIndex((op) => op.kind === 'rect' && op.fill === 'scrim');
			const firstText = ops.findIndex((op) => op.kind === 'text');

			expect(photoAt).toBeGreaterThanOrEqual(0);
			// Order is what makes it readable: photo, then scrim, then words.
			expect(scrimAt).toBeGreaterThan(photoAt);
			expect(firstText).toBeGreaterThan(scrimAt);

			const photo = ops[photoAt];
			expect(photo.kind === 'image' ? photo.fit : '').toBe('cover');
		});

		it('leaves the wording where it was, unlike the band', () => {
			const plain = laid({}).filter((op): op is TextOp => op.kind === 'text');
			const behind = laid({ showPhoto: true, photoMode: 'background' }).filter(
				(op): op is TextOp => op.kind === 'text'
			);
			const band = laid({ showPhoto: true, photoMode: 'band' }).filter(
				(op): op is TextOp => op.kind === 'text'
			);

			// A background takes no room from the flow; a band does.
			expect(behind[0].y).toBeCloseTo(plain[0].y, 5);
			expect(band[0].y).toBeLessThan(plain[0].y);
		});
	});

	it('tucks the QR into the corner when asked, and keeps the name beside it', () => {
		const ops = laid({ qrPosition: 'corner' });
		const qr = ops.find((op) => op.kind === 'image' && op.role === 'qr');
		const name = ops.find((op): op is TextOp => op.kind === 'text' && op.text === 'The Whitfields');

		expect(qr).toBeDefined();
		// Right-hand side of a 360pt card, and low.
		expect(qr && qr.kind === 'image' ? qr.x : 0).toBeGreaterThan(180);
		expect(qr && qr.kind === 'image' ? qr.y : 999).toBeLessThan(60);
		// The household name is ranged left against the margin rather than centred.
		expect(name?.align).toBe('left');
	});
});

describe('the SVG preview', () => {
	it('renders the card as scalable SVG', () => {
		const svg = invitationSvg(
			invitationTextFor(invitation, makeHousehold({ name: 'The Whitfields' }), SITE),
			{ widthIn: 5, heightIn: 7, variant: 'full' }
		);

		expect(svg.startsWith('<svg')).toBe(true);
		// The viewBox is in PDF points, so the preview is dimensionally exact.
		expect(svg).toContain('viewBox="0 0 360 504"');
		expect(svg).toContain('The Whitfields');
	});

	it('escapes text rather than letting it become markup', () => {
		const hostile = {
			...invitationTextFor(invitation, makeHousehold({ name: 'x' }), SITE),
			names: '<script>alert(1)</script>'
		};

		const svg = invitationSvg(hostile, { widthIn: 5, heightIn: 7, variant: 'full' });
		expect(svg).not.toContain('<script>');
		expect(svg).toContain('&lt;script&gt;');
	});

	it('leaves a placeholder when no QR code has loaded yet', () => {
		const svg = invitationSvg(
			invitationTextFor(invitation, makeHousehold({ name: 'x' }), SITE),
			{ widthIn: 5, heightIn: 7, variant: 'full', qrDataUrl: null }
		);
		expect(svg).not.toContain('<image');
		expect(svg).toContain('#f0f0f0');
	});
});
