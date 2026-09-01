import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { getSection, getSetting, logActivity, setSection } from '$shared/db';
import { getConfig } from '$shared/config';
import { cleanText } from '$shared/sanitize';
import { hexToTriplet } from '$shared/theme';
import { ORDERABLE } from '$lib/sections';
import type { SectionToggles, ThemeContent, WordingContent } from '$shared/types';

const FONT_CHOICES: ThemeContent['fonts'][] = ['serif-sans', 'sans-sans', 'serif-serif'];
const HERO_CHOICES: ThemeContent['hero'][] = ['photo', 'tint', 'plain'];

export const load: PageServerLoad = () => {
	const coupleNames = getSetting('couple_names');

	return {
		theme: getSection('theme', coupleNames),
		wording: getSection('wording', coupleNames),
		sections: getSection('sections', coupleNames),
		orderable: ORDERABLE,
		siteUrl: getConfig().siteUrl
	};
};

export const actions: Actions = {
	saveTheme: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const form = result.form;
		const accent = cleanText(form.get('accent'), { max: 9 });

		if (!hexToTriplet(accent)) {
			// Refused rather than silently replaced, or the couple would pick a colour,
			// see no change, and have nothing to tell them why.
			return fail(400, { error: `"${accent}" is not a colour. Use a hex value like #8A9A7B.` });
		}

		const fonts = form.get('fonts')?.toString() as ThemeContent['fonts'];
		const hero = form.get('hero')?.toString() as ThemeContent['hero'];

		// The order arrives as one field per row, in the order the browser serialised
		// them -- which is the order they appear on screen after any dragging.
		const submitted = form
			.getAll('order')
			.map((value) => value.toString())
			.filter((key): key is keyof SectionToggles =>
				ORDERABLE.some((section) => section.key === key)
			);

		const theme: ThemeContent = {
			accent,
			fonts: FONT_CHOICES.includes(fonts) ? fonts : 'serif-sans',
			hero: HERO_CHOICES.includes(hero) ? hero : 'photo',
			// Anything the form forgot is appended, so a section can never fall out of the
			// navigation because of a half-submitted order.
			order: [
				...submitted,
				...ORDERABLE.map((section) => section.key).filter((key) => !submitted.includes(key))
			]
		};

		setSection('theme', theme);
		logActivity({
			eventType: 'content_changed',
			description: 'Changed the site appearance',
			metadata: { accent: theme.accent, fonts: theme.fonts, hero: theme.hero },
			ipAddress: event.locals.clientIp
		});

		return { success: 'Appearance saved.' };
	},

	saveWording: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const form = result.form;
		const previous = getSection('wording');
		const text = (name: keyof WordingContent, max = 160) =>
			cleanText(form.get(name), { max }) || previous[name];

		const wording: WordingContent = {
			rsvpButton: text('rsvpButton', 40),
			detailsButton: text('detailsButton', 40),
			footerNote: text('footerNote', 80),
			rsvpHeading: text('rsvpHeading', 60),
			// The only line allowed to be empty -- there is often nothing to add.
			rsvpIntro: cleanText(form.get('rsvpIntro'), { max: 200 }),
			rsvpAcceptLabel: text('rsvpAcceptLabel', 60),
			rsvpDeclineLabel: text('rsvpDeclineLabel', 60),
			rsvpCountQuestion: text('rsvpCountQuestion', 120),
			rsvpSubmitLabel: text('rsvpSubmitLabel', 40),
			rsvpUpdateLabel: text('rsvpUpdateLabel', 40),
			thanksAttendingHeading: text('thanksAttendingHeading', 60),
			thanksAttendingBody: text('thanksAttendingBody', 200),
			thanksDecliningHeading: text('thanksDecliningHeading', 60),
			thanksDecliningBody: text('thanksDecliningBody', 200)
		};

		setSection('wording', wording);
		logActivity({
			eventType: 'content_changed',
			description: 'Edited the site wording',
			ipAddress: event.locals.clientIp
		});

		return { success: 'Wording saved.' };
	}
};
