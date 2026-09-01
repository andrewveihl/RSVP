/**
 * The site sections that can be reordered, with the labels the editor shows.
 *
 * In its own module rather than exported from a route file: SvelteKit permits only its
 * own known exports (`load`, `actions`, ...) from `+page.server.ts` and refuses to
 * build otherwise.
 */
import type { SectionToggles } from '$shared/types';

export const ORDERABLE: { key: keyof SectionToggles; label: string }[] = [
	{ key: 'story', label: 'Our Story' },
	{ key: 'details', label: 'Event Details' },
	{ key: 'party', label: 'Wedding Party' },
	{ key: 'gallery', label: 'Photos' },
	{ key: 'registry', label: 'Registry' },
	{ key: 'faq', label: 'FAQ' }
];
