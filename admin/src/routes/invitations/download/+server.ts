import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CSRF_FIELD, verifyCsrf } from '$shared/csrf';
import { getHouseholdsByIds, getImage, listHouseholds, logActivity } from '$shared/db';
import {
	BLEED_IN,
	buildInvitationPdf,
	CARD_PRESETS,
	PRINTABLE_PHOTO_TYPES,
	type CardOptions,
	type InvitationPhoto
} from '$shared/invitations';
import { invitationContent } from '$lib/server/invitation-content';
import { qrPng } from '$shared/qr';
import { getConfig } from '$shared/config';
import { rsvpUrl } from '$shared/tokens';
import { createZip, safeEntryName } from '$shared/zip';
import { clampInteger } from '$shared/sanitize';

/**
 * Generates invitation files.
 *
 * A POST endpoint rather than a form action because the response *is* the file: a form
 * action has to return data for a page to re-render, and streaming a 200-page PDF
 * through one would mean base64-ing it into JSON first.
 *
 * A plain `<form method="POST">` submit still drives it, so the download works without
 * JavaScript, and the CSRF token rides in the body exactly as it does everywhere else.
 */

function cardOptions(form: FormData): CardOptions {
	const preset = form.get('preset')?.toString() ?? '5x7';
	const known = CARD_PRESETS[preset as keyof typeof CARD_PRESETS];

	// Bleed and crop marks are what a print shop asks for and what makes a home print
	// look wrong, so they are opt-in per run rather than a stored setting.
	const printShop = form.get('printShop') === '1';
	const press = printShop ? { bleedIn: BLEED_IN, showCropMarks: true } : {};

	if (preset === 'custom' || !known) {
		return {
			widthIn: clampInteger(form.get('width'), 1, 20, 5),
			heightIn: clampInteger(form.get('height'), 1, 20, 7),
			variant: form.get('variant') === 'insert' ? 'insert' : 'full',
			...press
		};
	}

	return {
		widthIn: known.width,
		heightIn: known.height,
		// The insert presets carry their variant in the name, so picking one selects
		// the layout as well as the size -- there is no way to ask for a 2.5x3.5 full
		// invitation, which would be unreadable anyway.
		variant: preset.startsWith('insert')
			? 'insert'
			: form.get('variant') === 'insert'
				? 'insert'
				: 'full',
		...press
	};
}

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	if (!locals.admin) error(401, 'Not signed in.');

	const form = await request.formData();
	const csrf = verifyCsrf(request, cookies, form.get(CSRF_FIELD)?.toString() ?? null);
	if (!csrf.ok) error(403, 'Your session expired. Reload the page and try again.');

	const ids = form.getAll('ids').map((value) => value.toString());
	const households = ids.length > 0 ? getHouseholdsByIds(ids) : listHouseholds({ sort: 'name' });

	if (households.length === 0) error(400, 'Select at least one household.');

	const options = cardOptions(form);
	const invitation = invitationContent();
	const photo = invitationPhoto(invitation.showPhoto ? invitation.photoId : null);
	const siteUrl = getConfig().siteUrl;
	const format = form.get('format')?.toString() ?? 'pdf';

	logActivity({
		eventType: 'invitation_generated',
		description: `Generated ${households.length} invitation(s) as ${format.toUpperCase()}`,
		metadata: { count: households.length, format, ...options },
		ipAddress: locals.clientIp
	});

	if (format === 'zip-pdf') {
		// One PDF per household, zipped: what you want when each invitation goes into
		// its own envelope rather than to a print shop as one batch.
		const files = await Promise.all(
			households.map(async (household) => ({
				name: safeEntryName(household.name, 'pdf'),
				data: await buildInvitationPdf([household], invitation, siteUrl, options, photo)
			}))
		);
		return fileResponse(createZip(dedupeNames(files)), 'application/zip', 'invitations.zip');
	}

	if (format === 'zip-png') {
		// PNGs are the QR codes themselves rather than a rasterised card: a PNG of a
		// whole invitation would need a rendering engine, and the QR is the part anyone
		// actually wants as an image (to drop into a design of their own).
		const files = await Promise.all(
			households.map(async (household) => ({
				name: safeEntryName(household.name, 'png'),
				data: new Uint8Array(await qrPng(rsvpUrl(siteUrl, household.token), { size: 1024 }))
			}))
		);
		return fileResponse(createZip(dedupeNames(files)), 'application/zip', 'qr-codes.zip');
	}

	const pdf = await buildInvitationPdf(households, invitation, siteUrl, options, photo);
	const filename =
		households.length === 1
			? safeEntryName(households[0].name, 'pdf')
			: `invitations-${households.length}.pdf`;

	return fileResponse(Buffer.from(pdf), 'application/pdf', filename);
};

/**
 * The couple's invitation photo, ready to embed, or null.
 *
 * The format is re-checked on the way out rather than trusted from the upload: a row
 * written by an older build, or an id edited straight into the database, must not reach
 * pdf-lib as something it cannot embed.
 */
function invitationPhoto(photoId: string | null): InvitationPhoto | null {
	if (!photoId) return null;

	const image = getImage(photoId);
	if (!image?.data || !PRINTABLE_PHOTO_TYPES.has(image.mimetype)) return null;

	return { data: new Uint8Array(image.data), mimetype: image.mimetype };
}

function fileResponse(body: Buffer, type: string, filename: string): Response {
	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': type,
			'content-length': String(body.length),
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
}

/**
 * Two households really can be called "The Smith Family". A ZIP with two identical
 * entry names is legal but extracts to one file, silently losing an invitation, so
 * repeats get a numeric suffix.
 */
function dedupeNames(files: { name: string; data: Uint8Array }[]): { name: string; data: Uint8Array }[] {
	const seen = new Map<string, number>();

	return files.map((file) => {
		const count = seen.get(file.name) ?? 0;
		seen.set(file.name, count + 1);
		if (count === 0) return file;

		const dot = file.name.lastIndexOf('.');
		return { ...file, name: `${file.name.slice(0, dot)} (${count + 1})${file.name.slice(dot)}` };
	});
}
