/**
 * Fade-and-rise on scroll.
 *
 * The hiding class is added *by this action*, which only ever runs in the browser, so
 * a visitor without JavaScript never gets an invisible page -- the content is simply
 * always visible for them. Doing it the other way round (hidden in the markup, revealed
 * by script) is the standard way this effect breaks a site.
 */
import type { Action } from 'svelte/action';

export interface RevealOptions {
	/** Stagger, in milliseconds, for items revealed as a group. */
	delay?: number;
}

export const reveal: Action<HTMLElement, RevealOptions | undefined> = (node, options) => {
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduced || typeof IntersectionObserver === 'undefined') return;

	node.classList.add('reveal');
	if (options?.delay) node.style.transitionDelay = `${options.delay}ms`;

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.classList.add('is-visible');
				// One-shot: re-animating on every scroll past is distracting rather than
				// delightful once you have seen it.
				observer.unobserve(entry.target);
			}
		},
		{ threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
};
