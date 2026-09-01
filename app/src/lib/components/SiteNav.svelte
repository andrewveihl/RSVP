<script lang="ts">
	/**
	 * The site header.
	 *
	 * On phones this is a single horizontal strip that scrolls sideways rather than a
	 * hamburger. The reasons are practical: every destination stays visible, nothing
	 * needs a tap to *discover* what the tap will reveal, and it works with JavaScript
	 * disabled without a `<details>` element pretending to be a menu.
	 *
	 * The current page scrolls itself into view on load, so on a narrow screen a guest
	 * deep in the list is not left looking at links they have already passed.
	 */
	import { page } from '$app/state';

	let {
		coupleNames,
		links
	}: { coupleNames: string; links: { href: string; label: string }[] } = $props();

	const isCurrent = (href: string) =>
		page.url.pathname === href || (href !== '/' && page.url.pathname.startsWith(`${href}/`));

	/** Initials for the wordmark: "Andrew & Madeline" becomes "A & M". */
	const monogram = $derived(
		coupleNames
			.split(/\s*(?:&|and)\s*/i)
			.map((part) => part.trim().charAt(0).toUpperCase())
			.filter(Boolean)
			.join(' & ') || 'Wedding'
	);

	let strip = $state<HTMLElement | null>(null);

	$effect(() => {
		// Depend on the path, so this re-runs on client-side navigation too.
		void page.url.pathname;
		const current = strip?.querySelector('[aria-current="page"]');
		current?.scrollIntoView({ block: 'nearest', inline: 'center' });
	});
</script>

<header class="sticky top-0 z-30 border-b border-line/70 bg-canvas/90 backdrop-blur">
	<div class="mx-auto w-full max-w-5xl px-5 pt-3">
		<a
			href="/"
			class="font-display text-lg tracking-wide text-ink transition-colors hover:text-accent"
		>
			{monogram}
		</a>
	</div>

	<nav aria-label="Main" class="mx-auto w-full max-w-5xl">
		<!--
			`scrollbar-none` hides the bar but keeps the scrolling; the fades at each edge
			are what actually signal there is more to see. `overscroll-x-contain` stops a
			sideways swipe here from triggering the browser's back gesture.
		-->
		<ul
			bind:this={strip}
			class="scrollbar-none flex snap-x gap-1 overflow-x-auto overscroll-x-contain px-5 pb-1"
		>
			{#each links as link (link.href)}
				<li class="snap-start">
					<a
						href={link.href}
						class="block whitespace-nowrap px-3 py-2.5 text-sm transition-colors"
						class:text-accent={isCurrent(link.href)}
						class:text-muted={!isCurrent(link.href)}
						class:underline={isCurrent(link.href)}
						class:decoration-2={isCurrent(link.href)}
						class:underline-offset-8={isCurrent(link.href)}
						aria-current={isCurrent(link.href) ? 'page' : undefined}
					>
						{link.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</header>

<style>
	.scrollbar-none {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.scrollbar-none::-webkit-scrollbar {
		display: none;
	}
</style>
