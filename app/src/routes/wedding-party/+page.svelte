<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const party = $derived(data.site.content.party);
</script>

<svelte:head>
	<title>{party.heading} &middot; {data.site.coupleNames}</title>
</svelte:head>

<div class="section max-w-5xl">
	<header class="text-center">
		<p class="eyebrow">{data.site.coupleNames}</p>
		<h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">{party.heading}</h1>
		{#if party.intro}
			<p class="mx-auto mt-4 max-w-xl text-muted">{party.intro}</p>
		{/if}
	</header>

	{#if party.members.length === 0}
		<p class="mt-16 text-center text-muted">Details coming soon.</p>
	{:else}
		<ul class="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
			{#each party.members as member, index (member.id)}
				<li use:reveal={{ delay: index * 60 }} class="card overflow-hidden">
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
			{/each}
		</ul>
	{/if}
</div>
