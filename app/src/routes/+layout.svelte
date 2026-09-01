<script lang="ts">
	import '../app.css';
	import SiteNav from '$lib/components/SiteNav.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	<title>{data.site.coupleNames}</title>
	<meta
		name="description"
		content="{data.site.coupleNames} are getting married{data.site.weddingDateLabel
			? ` on ${data.site.weddingDateLabel}`
			: ''}."
	/>
</svelte:head>

<SiteNav coupleNames={data.site.coupleNames} links={data.site.nav} />

{#if data.site.content.announcement}
	<p class="bg-accent-soft px-5 py-3 text-center text-sm text-ink">
		{data.site.content.announcement}
	</p>
{/if}

<main class="flex-1">
	{@render children()}
</main>

<SiteFooter
	coupleNames={data.site.coupleNames}
	weddingDateLabel={data.site.weddingDateLabel}
	contactEmail={data.site.contactEmail}
/>
