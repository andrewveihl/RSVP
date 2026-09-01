/**
 * How a household token becomes a URL.
 *
 * Kept apart from `tokens.ts` because that module *generates* tokens and therefore
 * imports `node:crypto`, which does not exist in a browser. The admin's live invitation
 * preview needs to build the link it is about to draw, so the two lines of string
 * handling live here where client code can reach them.
 *
 * Nothing secret is computed here -- these are the URLs printed on the cards.
 */

/** The single source of truth for how a token becomes a guest-facing URL. */
export function rsvpUrl(siteUrl: string, token: string): string {
	return `${siteUrl.replace(/\/+$/, '')}/rsvp/${token}`;
}

/** Where the universal QR code points: the look-up-by-name fallback. */
export function lookupUrl(siteUrl: string): string {
	return `${siteUrl.replace(/\/+$/, '')}/rsvp`;
}
