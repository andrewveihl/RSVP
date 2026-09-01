import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getImage } from '$shared/db';

/**
 * Serves a site image for the content editor's previews.
 *
 * The guest app serves the same bytes publicly, but the admin runs on its own origin
 * and its CSP is `img-src 'self'`, so it cannot render the guest app's URLs. This is
 * that same endpoint on this origin -- behind the session, and never cached, because
 * nothing in the admin panel should sit in an intermediary.
 */
export const GET: RequestHandler = ({ params, locals, setHeaders }) => {
	if (!locals.admin) error(401, 'Not signed in.');

	const image = getImage(params.id);
	if (!image?.data) error(404, 'Not found');

	setHeaders({
		'content-type': image.mimetype,
		'cache-control': 'no-store',
		'x-content-type-options': 'nosniff',
		'content-disposition': `inline; filename="${image.filename}"`
	});

	return new Response(new Uint8Array(image.data));
};
