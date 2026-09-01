import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHousehold } from '$shared/db';
import { getConfig } from '$shared/config';
import { lookupUrl, rsvpUrl } from '$shared/tokens';
import { qrPng, qrSvg } from '$shared/qr';
import { safeEntryName } from '$shared/zip';
import { clampInteger } from '$shared/sanitize';
import type { QRCodeErrorCorrectionLevel } from 'qrcode';

/**
 * A single QR code as a file: `/qr/<household-id>.png`, `.svg`, or `/qr/universal.png`
 * for the code that points at the name look-up page.
 *
 * The extension is part of the path rather than a query parameter so the browser's
 * "save as" already suggests the right filename, and a saved link keeps its type.
 */
const VALID_LEVELS = new Set(['L', 'M', 'Q', 'H']);

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.admin) error(401, 'Not signed in.');

	const match = /^(.+)\.(png|svg)$/.exec(params.file);
	if (!match) error(404, 'Ask for a .png or a .svg.');

	const [, key, extension] = match;

	const level = (url.searchParams.get('level') ?? 'M').toUpperCase();
	const options = {
		size: clampInteger(url.searchParams.get('size'), 128, 2048, 1024),
		errorCorrectionLevel: (VALID_LEVELS.has(level) ? level : 'M') as QRCodeErrorCorrectionLevel
	};

	if (key === 'universal') {
		const target = lookupUrl(getConfig().siteUrl);
		return respond(extension, await render(extension, target, options), 'universal-rsvp');
	}

	const household = getHousehold(key);
	if (!household) error(404, 'No such household.');

	const target = rsvpUrl(getConfig().siteUrl, household.token);
	return respond(extension, await render(extension, target, options), household.name);
};

async function render(
	extension: string,
	target: string,
	options: { size: number; errorCorrectionLevel: QRCodeErrorCorrectionLevel }
): Promise<Buffer> {
	if (extension === 'svg') return Buffer.from(await qrSvg(target, options), 'utf8');
	return qrPng(target, options);
}

function respond(extension: string, body: Buffer, name: string): Response {
	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': extension === 'svg' ? 'image/svg+xml' : 'image/png',
			'content-disposition': `attachment; filename="${safeEntryName(name, extension)}"`,
			// A QR code encodes a token, so it must not sit in a shared cache.
			'cache-control': 'no-store'
		}
	});
}
