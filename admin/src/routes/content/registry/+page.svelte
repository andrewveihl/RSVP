<script lang="ts">
	import { untrack } from 'svelte';
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { RegistryLink } from '$shared/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// A working copy, seeded once from the loaded content and then owned by this
	// form until it is saved. `untrack` marks that one-time read as deliberate.
	let links = $state<RegistryLink[]>(untrack(() => structuredClone(data.registry.links)));

	function add() {
		links = [
			...links,
			{ id: `link-new-${links.length}-${Date.now()}`, name: '', url: '', description: '' }
		];
	}

	function remove(index: number) {
		links = links.filter((_, position) => position !== index);
	}

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= links.length) return;
		const next = [...links];
		[next[index], next[target]] = [next[target], next[index]];
		links = next;
	}
</script>

<ContentNav siteUrl={data.siteUrl} />
<Flash {form} />

<form method="POST" action="?/save" class="mt-5 space-y-4">
	<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
	<input type="hidden" name="link_count" value={links.length} />

	<section class="card grid gap-4 p-5 sm:grid-cols-2">
		<div>
			<label class="label" for="heading">Page heading</label>
			<input id="heading" name="heading" class="field" value={data.registry.heading} />
		</div>
		<div>
			<label class="label" for="intro">Intro line</label>
			<input id="intro" name="intro" class="field" value={data.registry.intro} />
		</div>
	</section>

	<section class="card p-5">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold text-ink">Registries</h2>
			<button type="button" class="btn-secondary btn-sm" onclick={add}>Add a registry</button>
		</div>
		<p class="mt-1 text-xs text-muted">
			Only http and https links are saved -- anything else is dropped when you save.
		</p>

		{#if links.length === 0}
			<p class="mt-4 text-sm text-muted">No registries yet.</p>
		{/if}

		<ul class="mt-4 space-y-4">
			{#each links as link, index (link.id)}
				<li class="rounded-xl border border-line p-4">
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs uppercase tracking-wide text-muted">#{index + 1}</span>
						<div class="flex gap-1">
							<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, -1)} aria-label="Move earlier">
								&uarr;
							</button>
							<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, 1)} aria-label="Move later">
								&darr;
							</button>
							<button type="button" class="btn-ghost btn-sm text-bad" onclick={() => remove(index)}>
								Remove
							</button>
						</div>
					</div>

					<input type="hidden" name="link_{index}_id" value={link.id} />

					<div class="mt-3 grid gap-3 sm:grid-cols-2">
						<div>
							<label class="label" for="link_{index}_name">Name</label>
							<input
								id="link_{index}_name"
								name="link_{index}_name"
								class="field"
								placeholder="Target"
								value={link.name}
							/>
						</div>
						<div>
							<label class="label" for="link_{index}_url">Link</label>
							<input
								id="link_{index}_url"
								name="link_{index}_url"
								type="url"
								class="field"
								placeholder="https://..."
								value={link.url}
							/>
						</div>
						<div class="sm:col-span-2">
							<label class="label" for="link_{index}_description">Note</label>
							<input
								id="link_{index}_description"
								name="link_{index}_description"
								class="field"
								placeholder="Optional -- a line of context"
								value={link.description}
							/>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<button type="submit" class="btn-primary">Save registry</button>
</form>
