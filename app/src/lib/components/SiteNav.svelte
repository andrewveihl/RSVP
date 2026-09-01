<script lang="ts">
	/**
	 * The site header.
	 *
	 * The mobile menu is a `<details>` element rather than a JavaScript-driven panel,
	 * so navigation works on a phone with scripts blocked -- which is the whole point
	 * of a content site that renders server-side.
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
</script>

<header class="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur">
	<nav class="mx-auto flex w-full max-w-5xl items-center gap-4 px-5 py-3" aria-label="Main">
		<a
			href="/"
			class="font-display text-xl tracking-wide text-ink transition-colors hover:text-accent"
		>
			{monogram}
		</a>

		<!-- Desktop -->
		<ul class="ml-auto hidden items-center gap-6 md:flex">
			{#each links as link (link.href)}
				<li>
					<a
						href={link.href}
						class="text-sm transition-colors hover:text-accent"
						class:text-accent={isCurrent(link.href)}
						class:text-muted={!isCurrent(link.href)}
						aria-current={isCurrent(link.href) ? 'page' : undefined}
					>
						{link.label}
					</a>
				</li>
			{/each}
		</ul>

		<!-- Mobile: a native disclosure, so it opens without JavaScript. -->
		<details class="group relative ml-auto md:hidden">
			<summary
				class="flex min-h-[48px] min-w-[48px] cursor-pointer list-none items-center justify-center rounded-full text-muted transition-colors hover:text-ink"
				aria-label="Menu"
			>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 7h16M4 12h16M4 17h16"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</summary>

			<ul
				class="absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-surface py-2 shadow-lift"
			>
				{#each links as link (link.href)}
					<li>
						<a
							href={link.href}
							class="block px-5 py-3 text-sm transition-colors hover:bg-sunken"
							class:text-accent={isCurrent(link.href)}
							class:text-ink={!isCurrent(link.href)}
							aria-current={isCurrent(link.href) ? 'page' : undefined}
						>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</details>
	</nav>
</header>

<style>
	/* Safari still paints the default disclosure triangle without this. */
	summary::-webkit-details-marker {
		display: none;
	}
</style>
