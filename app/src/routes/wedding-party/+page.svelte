<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import { isPartyGrouped, partyGroups } from '$shared/party';
	import type { PartyMember } from '$shared/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const party = $derived(data.site.content.party);
	const groups = $derived(partyGroups(party.members));
	const grouped = $derived(isPartyGrouped(groups));

	/*
	 * Flex rather than grid, because the last row is the whole point: a grid ranges
	 * five cards as four and one hard against the left edge, where wrapped flex items
	 * centre the short row under the full one.
	 *
	 * The widths are basis minus a share of the gap, so four cards and three 2rem gaps
	 * come to exactly the row. Grouped, each block is half the page and holds two
	 * cards -- which is still four across, and cards the same size either way.
	 */
	const cardWidth = $derived(
		grouped ? 'w-full sm:w-[calc(50%-1rem)]' : 'w-full sm:w-[calc(50%-1rem)] lg:w-[calc(25%-1.5rem)]'
	);
</script>

{#snippet card(member: PartyMember, index: number)}
	<li use:reveal={{ delay: index * 60 }} class="card max-w-xs overflow-hidden {cardWidth}">
		{#if member.imageId}
			<img
				src="/images/{member.imageId}"
				alt=""
				loading="lazy"
				decoding="async"
				class="aspect-[4/5] w-full object-cover"
			/>
		{:else}
			<!-- A calm placeholder block keeps the grid even when a photo is missing. -->
			<div class="flex aspect-[4/5] w-full items-center justify-center bg-sunken">
				<span class="font-display text-4xl text-muted/60">
					{member.name.trim().charAt(0).toUpperCase()}
				</span>
			</div>
		{/if}

		<div class="p-5">
			<p class="font-display text-xl text-ink">{member.name}</p>
			{#if member.role}
				<p class="eyebrow mt-1">{member.role}</p>
			{/if}
			{#if member.bio}
				<p class="mt-3 text-sm leading-relaxed text-muted">{member.bio}</p>
			{/if}
		</div>
	</li>
{/snippet}

<svelte:head>
	<title>{party.heading} &middot; {data.site.coupleNames}</title>
</svelte:head>

<div class="section max-w-6xl">
	<header class="text-center">
		<p class="eyebrow">{data.site.coupleNames}</p>
		<h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">{party.heading}</h1>
		{#if party.intro}
			<p class="mx-auto mt-4 max-w-xl text-muted">{party.intro}</p>
		{/if}
	</header>

	{#if party.members.length === 0}
		<p class="mt-16 text-center text-muted">Details coming soon.</p>
	{:else if grouped}
		<div class="mt-14 flex flex-wrap justify-center gap-12">
			{#each groups as group (group.label)}
				<section class="w-full lg:w-[calc(50%-1.5rem)]">
					{#if group.label}
						<h2 class="text-center font-display text-2xl text-ink">{group.label}</h2>
					{/if}
					<ul class="mt-6 flex flex-wrap justify-center gap-8">
						{#each group.members as member, index (member.id)}
							{@render card(member, index)}
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{:else}
		<ul class="mt-14 flex flex-wrap justify-center gap-8">
			{#each party.members as member, index (member.id)}
				{@render card(member, index)}
			{/each}
		</ul>
	{/if}
</div>
