import type { PageServerLoad } from './$types';
import { weddingDateValue } from '$shared/config';

/**
 * The home page needs one thing the layout does not already carry: an absolute
 * timestamp for the countdown.
 *
 * It is resolved here rather than in the component so the target is the *server's*
 * idea of the wedding date -- pinned to the wedding's timezone by `TZ` in
 * docker-compose. A guest in another timezone then sees the same number of days as
 * everyone else, instead of one more or one fewer depending on where they are.
 */
export const load: PageServerLoad = async ({ parent }) => {
	const { site } = await parent();
	const date = weddingDateValue(site.weddingDate);

	return { countdownTarget: date ? date.toISOString() : null };
};
