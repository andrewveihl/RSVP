<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const registry = $derived(data.site.content.registry);

	/** "https://www.target.com/gift-registry/x" reads better as "target.com". */
	function hostLabel(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return '';
		}
	}
</script>

<svelte:head>
	<title>{registry.heading} &middot; {data.site.coupleNames}</title>
</svelte:head>

<div class="section">
	<header class="text-center">
		<p class="eyebrow">{data.site.coupleNames}</p>
		<h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">{registry.heading}</h1>
		{#if registry.intro}
			<p class="mx-auto mt-4 max-w-xl text-muted">{registry.intro}</p>
		{/if}
	</header>

	{#if data.links.length === 0}
		<p class="mt-16 text-center text-muted">Registry details coming soon.</p>
	{:else}
		<ul class="mt-12 grid gap-4 sm:grid-cols-2">
			{#each data.links as link, index (link.id)}
				<li use:reveal={{ delay: index * 60 }}>
					<a
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						class="card flex h-full flex-col justify-between p-6 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lift"
					>
						<span>
							<span class="block font-display text-2xl text-ink">{link.name}</span>
							{#if link.description}
								<span class="mt-2 block text-sm text-muted">{link.description}</span>
							{/if}
						</span>
						<span class="mt-6 text-xs uppercase tracking-widest text-accent">
							{hostLabel(link.url)} &rarr;
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
