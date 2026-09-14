<script lang="ts">
	import FlipClock from '$lib/components/FlipClock.svelte';
	import { reveal } from '$lib/actions/reveal';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const hero = $derived(data.site.content.hero);
	const sections = $derived(data.site.content.sections);
	const words = $derived(data.site.content.wording);
	const heroStyle = $derived(data.site.content.theme.hero);

	// 'plain' ignores the photo entirely; 'tint' pushes the scrim up so the type reads
	// over a busy image at the cost of the photo itself.
	const showPhoto = $derived(Boolean(hero.imageId) && heroStyle !== 'plain');
	const scrim = $derived(heroStyle === 'tint' ? 'bg-canvas/88' : 'bg-canvas/72');
</script>

<section class="relative isolate flex min-h-[78vh] flex-col items-center justify-center overflow-hidden px-5 py-20 text-center">
	{#if showPhoto}
		<img
			src="/images/{hero.imageId}"
			alt=""
			fetchpriority="high"
			class="absolute inset-0 -z-10 h-full w-full object-cover"
			style="object-position: {hero.focusX}% {hero.focusY}%"
		/>
		<!-- A scrim rather than a filter on the image: it keeps the type legible over a
		     bright photo without washing the photo out. -->
		<div class="absolute inset-0 -z-10 {scrim}"></div>
	{/if}

	<p class="eyebrow">{hero.subtitle}</p>

	<h1 class="mt-5 font-display text-5xl leading-tight text-ink sm:text-7xl">
		{hero.title}
	</h1>

	{#if hero.dateLine}
		<p class="mt-5 text-sm uppercase tracking-widest text-muted">{hero.dateLine}</p>
	{/if}

	<div class="mt-10 flex flex-wrap items-center justify-center gap-3">
		<a href="/rsvp" class="btn-primary">{words.rsvpButton}</a>
		{#if sections.details}
			<a href="/details" class="btn-secondary">{words.detailsButton}</a>
		{/if}
	</div>
</section>

{#if sections.countdown && data.countdownTarget}
	<section class="border-y border-line/70 bg-sunken/50 px-5 py-14">
		<div use:reveal class="mx-auto max-w-3xl">
			<FlipClock target={data.countdownTarget} coupleNames={data.site.coupleNames} />
		</div>
	</section>
{/if}

<section class="section text-center">
	<div use:reveal>
		<p class="eyebrow">The short version</p>
		<h2 class="mt-4 font-display text-3xl text-ink sm:text-4xl">
			{data.site.content.details.dateLine}
		</h2>
		<p class="mt-3 text-muted">
			{data.site.content.details.venueName}
		</p>

		<div class="mt-10 flex flex-wrap items-center justify-center gap-3">
			{#if sections.story}
				<a href="/our-story" class="btn-secondary">Our story</a>
			{/if}
			{#if sections.registry}
				<a href="/registry" class="btn-secondary">Registry</a>
			{/if}
			{#if sections.faq}
				<a href="/faq" class="btn-secondary">Questions</a>
			{/if}
		</div>
	</div>
</section>
