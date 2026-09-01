<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const details = $derived(data.site.content.details);

	/** The fixed rows, plus whatever custom fields the couple added. */
	const rows = $derived(
		[
			{ id: 'when', label: 'When', value: details.dateLine },
			{ id: 'time', label: 'Time', value: details.timeLine },
			{ id: 'where', label: 'Where', value: details.venueName },
			{ id: 'address', label: 'Address', value: details.venueAddress },
			{ id: 'dress', label: 'Dress code', value: details.dressCode },
			{ id: 'parking', label: 'Parking', value: details.parking },
			...details.extras.map((extra) => ({ id: extra.id, label: extra.label, value: extra.value }))
		].filter((row) => row.value?.trim())
	);
</script>

<svelte:head>
	<title>{details.heading} &middot; {data.site.coupleNames}</title>
</svelte:head>

<div class="section">
	<header class="text-center">
		<p class="eyebrow">{data.site.coupleNames}</p>
		<h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">{details.heading}</h1>
	</header>

	<dl class="mt-14 divide-y divide-line border-y border-line">
		{#each rows as row, index (row.id)}
			<div use:reveal={{ delay: index * 50 }} class="grid gap-1 py-6 sm:grid-cols-[10rem_1fr] sm:gap-6">
				<dt class="eyebrow sm:pt-1">{row.label}</dt>
				<dd class="whitespace-pre-line leading-relaxed text-ink">{row.value}</dd>
			</div>
		{/each}
	</dl>

	{#if data.mapUrl}
		<div class="mt-10 text-center">
			<!-- A plain link, not an embedded map: an iframe would mean loosening the CSP
			     to admit a third-party origin, which this site does not do anywhere. -->
			<a href={data.mapUrl} target="_blank" rel="noopener noreferrer" class="btn-secondary">
				Open in Maps
			</a>
		</div>
	{/if}
</div>
