<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const faq = $derived(data.site.content.faq);
	// Normalised in the load: every item here has an id and a question.
	const items = $derived(data.items);
</script>

<svelte:head>
	<title>{faq.heading} &middot; {data.site.coupleNames}</title>
</svelte:head>

<div class="section">
	<header class="text-center">
		<p class="eyebrow">{data.site.coupleNames}</p>
		<h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">{faq.heading}</h1>
		{#if faq.intro}
			<p class="mx-auto mt-4 max-w-xl text-muted">{faq.intro}</p>
		{/if}
	</header>

	<!--
		Native <details> rather than a scripted accordion: it opens without JavaScript,
		is keyboard-operable and announces its expanded state to screen readers for free.
		`name` makes them mutually exclusive in browsers that support it, and degrades to
		independent toggles in those that do not.
	-->
	<div class="mt-12 divide-y divide-line border-y border-line">
		{#each items as item, index (item.id)}
			<details use:reveal={{ delay: index * 40 }} name="faq" class="group">
				<summary
					class="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-ink transition-colors hover:text-accent"
				>
					<span class="font-medium">{item.question}</span>
					<span
						class="shrink-0 text-xl leading-none text-muted transition-transform duration-200 group-open:rotate-45"
						aria-hidden="true">+</span
					>
				</summary>
				<p class="pb-6 pr-8 leading-relaxed text-muted">{item.answer}</p>
			</details>
		{/each}
	</div>

	{#if data.site.contactEmail}
		<p class="mt-10 text-center text-sm text-muted">
			Still stuck?
			<a class="text-accent underline-offset-4 hover:underline" href="mailto:{data.site.contactEmail}">
				Email us
			</a>.
		</p>
	{/if}
</div>

<style>
	summary::-webkit-details-marker {
		display: none;
	}
</style>
