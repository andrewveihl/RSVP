<script lang="ts">
	import { page } from '$app/state';

	let { siteUrl }: { siteUrl: string } = $props();

	const tabs = [
		{ href: '/content', label: 'Home & sections' },
		{ href: '/content/appearance', label: 'Appearance' },
		{ href: '/content/story', label: 'Our story' },
		{ href: '/content/details', label: 'Event details' },
		{ href: '/content/party', label: 'Wedding party' },
		{ href: '/content/gallery', label: 'Photos' },
		{ href: '/content/registry', label: 'Registry' },
		{ href: '/content/faq', label: 'FAQ' }
	];

	// `/content` is a prefix of every other tab, so it only matches exactly.
	const isCurrent = (href: string) =>
		href === '/content' ? page.url.pathname === href : page.url.pathname.startsWith(href);
</script>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="font-display text-2xl text-ink">Website</h1>
		<p class="mt-1 text-sm text-muted">Everything the guest site says.</p>
	</div>
	<a href={siteUrl} target="_blank" rel="noopener noreferrer" class="btn-secondary btn-sm">
		View the site &rarr;
	</a>
</div>

<nav class="mt-4 flex flex-wrap gap-2 border-b border-line pb-3" aria-label="Content sections">
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			class="rounded-lg px-3 py-1.5 text-sm transition-colors"
			class:bg-accent-soft={isCurrent(tab.href)}
			class:text-accent={isCurrent(tab.href)}
			class:text-muted={!isCurrent(tab.href)}
			aria-current={isCurrent(tab.href) ? 'page' : undefined}
		>
			{tab.label}
		</a>
	{/each}
</nav>
