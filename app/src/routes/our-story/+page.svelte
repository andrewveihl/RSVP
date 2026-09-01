<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const story = $derived(data.site.content.story);
</script>

<svelte:head>
	<title>{story.heading} &middot; {data.site.coupleNames}</title>
</svelte:head>

<div class="section">
	<header class="text-center">
		<p class="eyebrow">{data.site.coupleNames}</p>
		<h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">{story.heading}</h1>
	</header>

	{#if story.milestones.length > 0}
		<!-- The rule runs down the left on mobile and through the middle from `sm` up,
		     so the alternating layout only kicks in where there is room for it. -->
		<ol class="relative mt-16 space-y-12 before:absolute before:inset-y-0 before:left-[7px] before:w-px before:bg-line sm:before:left-1/2">
			{#each story.milestones as milestone, index (milestone.id)}
				<li
					use:reveal={{ delay: index * 80 }}
					class="relative pl-9 sm:grid sm:grid-cols-2 sm:gap-10 sm:pl-0"
					class:sm:text-right={index % 2 === 0}
				>
					<span
						class="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-accent bg-canvas sm:left-1/2 sm:-translate-x-1/2"
						aria-hidden="true"
					></span>

					<div class={index % 2 === 0 ? 'sm:col-start-1 sm:pr-10' : 'sm:col-start-2 sm:pl-10'}>
						{#if milestone.date}
							<p class="eyebrow">{milestone.date}</p>
						{/if}
						<h2 class="mt-2 font-display text-2xl text-ink">{milestone.title}</h2>
						{#if milestone.description}
							<p class="mt-3 leading-relaxed text-muted">{milestone.description}</p>
						{/if}
						{#if milestone.imageId}
							<img
								src="/images/{milestone.imageId}"
								alt=""
								loading="lazy"
								decoding="async"
								class="mt-5 aspect-[4/3] w-full rounded-2xl border border-line object-cover"
							/>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}

	{#if data.narrativeHtml}
		<div use:reveal class="prose-site mx-auto mt-20 max-w-2xl text-left">
			<!-- Server-rendered from escaped plain text; see the load function. -->
			{@html data.narrativeHtml}
		</div>
	{/if}
</div>
