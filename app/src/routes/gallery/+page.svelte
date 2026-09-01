<script lang="ts">
	import Lightbox from '$lib/components/Lightbox.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const gallery = $derived(data.site.content.gallery);
</script>

<svelte:head>
	<title>{gallery.heading} &middot; {data.site.coupleNames}</title>
</svelte:head>

<div class="section max-w-4xl">
	<header class="text-center">
		<p class="eyebrow">{data.site.coupleNames}</p>
		<h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">{gallery.heading}</h1>
		{#if gallery.intro}
			<p class="mx-auto mt-4 max-w-xl text-muted">{gallery.intro}</p>
		{/if}
	</header>

	{#if data.images.length === 0}
		<p class="mt-16 text-center text-muted">Photos coming soon.</p>
	{:else}
		<div class="mt-12">
			<Lightbox images={data.images} />
		</div>
	{/if}

	{#if data.uploaderUrl}
		<!-- The companion photo-upload app. An external link, so it opens in its own tab
		     and carries no referrer. -->
		<div class="mt-14 rounded-2xl border border-line bg-sunken/60 p-6 text-center">
			<p class="text-ink">{gallery.uploaderNote}</p>
			<a
				href={data.uploaderUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="btn-primary mt-5"
			>
				Open the photo app
			</a>
		</div>
	{/if}
</div>
