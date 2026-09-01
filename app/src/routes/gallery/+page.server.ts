import type { PageServerLoad } from './$types';
import { requireSection } from '$lib/server/site';
import { listImages } from '$shared/db';
import { safeUrl } from '$shared/sanitize';

export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	requireSection(site.content, 'gallery');

	return {
		// Metadata only -- the bytes are served one at a time from /images/[id].
		images: listImages('gallery'),
		uploaderUrl: safeUrl(site.content.gallery.uploaderUrl)
	};
};
