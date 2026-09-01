/**
 * The design system, shared so the guest site and the admin app cannot drift apart.
 *
 * Every colour resolves through a CSS custom property rather than a literal, which is
 * what makes automatic dark mode work: `app.css` redefines the same variables inside a
 * `prefers-color-scheme: dark` block, so `bg-canvas` is correct in both themes without
 * a single `dark:` variant in the markup.
 *
 * The properties hold bare `R G B` triplets so Tailwind's `<alpha-value>` placeholder
 * can still compose opacity (`bg-accent/30`).
 *
 * Each app supplies its own `content` globs; this preset carries only theme values.
 */

/** @type {import('tailwindcss').Config} */
export default {
	content: [],
	theme: {
		extend: {
			colors: {
				canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
				surface: 'rgb(var(--c-surface) / <alpha-value>)',
				sunken: 'rgb(var(--c-sunken) / <alpha-value>)',
				ink: 'rgb(var(--c-ink) / <alpha-value>)',
				muted: 'rgb(var(--c-muted) / <alpha-value>)',
				line: 'rgb(var(--c-line) / <alpha-value>)',
				accent: {
					DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
					hover: 'rgb(var(--c-accent-hover) / <alpha-value>)',
					soft: 'rgb(var(--c-accent-soft) / <alpha-value>)'
				},
				ok: 'rgb(var(--c-ok) / <alpha-value>)',
				warn: 'rgb(var(--c-warn) / <alpha-value>)',
				bad: 'rgb(var(--c-bad) / <alpha-value>)'
			},
			fontFamily: {
				sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
				display: ['Cormorant Garamond', 'Iowan Old Style', 'Georgia', 'Times New Roman', 'serif']
			},
			boxShadow: {
				card: '0 1px 2px rgb(var(--c-shadow) / 0.05), 0 8px 24px rgb(var(--c-shadow) / 0.07)',
				lift: '0 2px 4px rgb(var(--c-shadow) / 0.06), 0 16px 40px rgb(var(--c-shadow) / 0.10)'
			},
			letterSpacing: {
				widest: '0.2em'
			}
		}
	},
	plugins: []
};
