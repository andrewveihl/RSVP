import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { deleteImage, getSetting, listHouseholds, logActivity, setSection } from '$shared/db';
import { replaceImage } from '$lib/server/image-upload';
import { invitationContent } from '$lib/server/invitation-content';
import { getConfig } from '$shared/config';
import { CARD_PRESETS, PRINTABLE_PHOTO_TYPES } from '$shared/invitations';
import { newRowId, readRows } from '$lib/server/content-forms';
import { cleanText } from '$shared/sanitize';
import { hexToTriplet } from '$shared/theme';
import type { InvitationContent, InvitationLine } from '$shared/types';

type LineStyle = InvitationLine['style'];
type LineSlot = InvitationLine['slot'];

const LINE_STYLES: LineStyle[] = ['display', 'body', 'small'];
const LINE_SLOTS: LineSlot[] = ['top', 'middle', 'bottom'];

/**
 * A slider's value, kept inside the range the layout will honour.
 *
 * A number that arrives outside it is clamped rather than refused: these come from
 * range inputs, so an out-of-range value means something tampered or a browser did
 * something odd, and neither is worth an error message the couple has to read.
 */
function clampNumber(value: FormDataEntryValue | null, min: number, max: number): number {
	const parsed = Number.parseFloat(value?.toString() ?? '');
	if (!Number.isFinite(parsed)) return 1;
	return Math.min(max, Math.max(min, Math.round(parsed * 100) / 100));
}

export const load: PageServerLoad = ({ url }) => {
	// The guests page links here with a pre-made selection, so a batch flows straight
	// from "these fifty" to "one PDF of these fifty".
	const preselected = (url.searchParams.get('ids') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	return {
		households: listHouseholds({ sort: 'name' }),
		preselected,
		presets: Object.entries(CARD_PRESETS).map(([key, preset]) => ({ key, ...preset })),
		defaults: {
			width: getSetting('invitation_width_in'),
			height: getSetting('invitation_height_in')
		},
		// Filled in from Settings and Event Details wherever the couple has not written
		// their own line, so the editor never shows a blank the preview then contradicts.
		invitation: invitationContent(),
		siteUrl: getConfig().siteUrl
	};
};

export const actions: Actions = {
	/**
	 * Saves the wording and styling. The preview is rendered live in the browser from
	 * the same layout code, so this only has to store what the admin settled on.
	 */
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const form = result.form;
		const text = (name: string, max = 200) => cleanText(form.get(name), { max });

		const accent = text('accent', 9);
		const ink = text('ink', 9);
		const background = text('background', 9);
		const font = form.get('font') === 'sans' ? 'sans' : 'serif';
		const names = text('names', 120);

		// The couple's own lines, in the order the browser serialised them -- which is
		// the order they appear in the editor after any rearranging.
		const lines: InvitationLine[] = readRows(form, 'line', 20)
			.map((row, index) => ({
				id: row.id(newRowId('line', index)),
				text: row.text('text', 160),
				style: LINE_STYLES.includes(row.text('style', 10) as LineStyle)
					? (row.text('style', 10) as LineStyle)
					: 'body',
				slot: LINE_SLOTS.includes(row.text('slot', 10) as LineSlot)
					? (row.text('slot', 10) as LineSlot)
					: 'bottom'
			}))
			.filter((line) => line.text);

		// Checked before a single byte of image is written. Bailing out afterwards would
		// leave the uploaded photo stored but unreferenced, and -- worse -- would already
		// have deleted the one it replaced.
		if (!names.trim()) {
			return fail(400, { error: 'The invitation needs at least a name on it.' });
		}

		const current = invitationContent();
		const removePhoto = form.get('removePhoto') === '1';

		const upload = await replaceImage(
			form.get('photo'),
			'invitation',
			// Only drop the old image when a new one has replaced it; the explicit
			// remove path below handles the other case.
			removePhoto ? null : current.photoId
		);
		if (upload.error) return fail(400, { error: upload.error });

		// pdf-lib can only embed PNG and JPEG. Refusing the rest here, rather than at
		// print time, is the difference between "pick another file" and a card that
		// previewed with a photo and printed without one.
		if (upload.image && !PRINTABLE_PHOTO_TYPES.has(upload.image.mimetype)) {
			deleteImage(upload.image.id);
			return fail(400, {
				error: 'An invitation photo has to be a JPEG or a PNG -- those are the only formats that can be embedded in a print-ready PDF.'
			});
		}

		let photoId = upload.image?.id ?? current.photoId;
		if (removePhoto && !upload.image) {
			if (current.photoId) deleteImage(current.photoId);
			photoId = null;
		}

		const invitation: InvitationContent = {
			eyebrow: text('eyebrow', 120),
			names,
			inviteLine: text('inviteLine', 160),
			dateLine: text('dateLine', 120),
			timeLine: text('timeLine', 120),
			venueName: text('venueName', 160),
			venueAddress: cleanText(form.get('venueAddress'), { multiline: true, max: 300 }),
			ceremonyLabel: text('ceremonyLabel', 40),
			receptionName: text('receptionName', 160),
			receptionAddress: cleanText(form.get('receptionAddress'), { multiline: true, max: 300 }),
			receptionLabel: text('receptionLabel', 40),
			lines,
			qrCaption: text('qrCaption', 60),
			photoId,
			showUrl: form.get('showUrl') === '1',
			showQr: form.get('showQr') === '1',
			// Cannot be on without a photo to show: the layout reserves the space from
			// this flag, and an empty band at the head of the card is just a mistake.
			showPhoto: form.get('showPhoto') === '1' && photoId !== null,
			showBorder: form.get('showBorder') === '1',
			photoMode: form.get('photoMode') === 'background' ? 'background' : 'band',
			align: form.get('align') === 'left' ? 'left' : 'center',
			qrPosition: form.get('qrPosition') === 'corner' ? 'corner' : 'foot',
			// Clamped here as well as in the layout: this is what gets stored, and a
			// value the layout has to correct on every render is a value that will read
			// back into the editor looking like it was accepted.
			scale: clampNumber(form.get('scale'), 0.7, 1.5),
			spacing: clampNumber(form.get('spacing'), 0.6, 1.8),
			font,
			// An unparseable colour is refused rather than stored, or every future render
			// would silently fall back and the admin would never know why.
			accent: hexToTriplet(accent) ? accent : '#8A9A7B',
			ink: hexToTriplet(ink) ? ink : '#1A1A1A',
			background: hexToTriplet(background) ? background : '#FFFFFF'
		};

		setSection('invitation', invitation);
		logActivity({
			eventType: 'content_changed',
			description: 'Edited the invitation design',
			ipAddress: event.locals.clientIp
		});

		return { success: 'Invitation saved.' };
	}
};
