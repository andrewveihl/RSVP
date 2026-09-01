import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getImage } from '$shared/db';

/**
 * Serves a site image out of the database.
 *
 * Ids are UUIDs and the content is public, so there is nothing to authorise -- the
 * work here is caching and content-type safety.
 *
 * The stored mimetype is trusted because `storeImage` derived it from the file's magic
 * bytes rather than from the browser's claim, and `nosniff` is set so a browser cannot
 * decide to interpret it as anything else.
 */
export const GET: RequestHandler = ({ params, setHeaders, request }) => {
	const image = getImage(params.id);
	if (!image?.data) error(404, 'Not found');

	// The bytes at a given id never change -- an edit stores a new row with a new id --
	// so this can be cached hard and revalidated with an ETag.
	const etag = `"${image.id}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	setHeaders({
		'content-type': image.mimetype,
		'cache-control': 'public, max-age=31536000, immutable',
		etag,
		'x-content-type-options': 'nosniff',
		'content-disposition': `inline; filename="${image.filename}"`
	});

	return new Response(new Uint8Array(image.data));
};
