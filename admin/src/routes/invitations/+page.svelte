<script lang="ts">
	import { untrack } from 'svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Seeded from the ?ids= the guest list linked here with, then owned by this page.
	let selected = $state(untrack(() => new Set<string>(data.preselected)));
	let preset = $state('5x7');
	let variant = $state<'full' | 'insert'>('full');
	let width = $state(untrack(() => data.defaults.width));
	let height = $state(untrack(() => data.defaults.height));
	let format = $state('pdf');
	let filter = $state('');

	const visible = $derived(
		filter.trim()
			? data.households.filter((household) =>
					household.name.toLowerCase().includes(filter.trim().toLowerCase())
				)
			: data.households
	);

	const isInsertPreset = $derived(preset.startsWith('insert'));
	const isCustom = $derived(preset === 'custom');

	const previewHref = $derived.by(() => {
		const params = new URLSearchParams({ preset, variant });
		const first = [...selected][0] ?? data.households[0]?.id;
		if (first) params.set('household', first);
		if (isCustom) {
			params.set('width', width);
			params.set('height', height);
		}
		return `/invitations/preview?${params.toString()}`;
	});

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function selectAll() {
		selected = new Set(visible.map((household) => household.id));
	}
</script>

<div>
	<h1 class="font-display text-2xl text-ink">Invitations</h1>
	<p class="mt-1 text-sm text-muted">
		Minimal cards with a QR code unique to each household. Print-ready PDF, or a ZIP of
		individual files.
	</p>
</div>

<form method="POST" action="/invitations/download" class="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
	<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />

	<section class="card p-5">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 class="text-sm font-semibold text-ink">Who is this for?</h2>
				<p class="text-xs text-muted">
					{selected.size === 0
						? 'Nothing selected -- every household will be included.'
						: `${selected.size} selected.`}
				</p>
			</div>
			<div class="flex gap-2">
				<input
					class="field w-40"
					placeholder="Filter by name"
					bind:value={filter}
					aria-label="Filter households"
				/>
				<button type="button" class="btn-ghost btn-sm" onclick={selectAll}>Select all</button>
				<button type="button" class="btn-ghost btn-sm" onclick={() => (selected = new Set())}>
					Clear
				</button>
			</div>
		</div>

		<ul class="mt-4 max-h-[26rem] divide-y divide-line overflow-y-auto rounded-lg border border-line">
			{#each visible as household (household.id)}
				<li>
					<label class="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-sunken">
						<input
							type="checkbox"
							name="ids"
							value={household.id}
							checked={selected.has(household.id)}
							onchange={() => toggle(household.id)}
						/>
						<span class="text-ink">{household.name}</span>
						{#if household.invitationSent}
							<span class="pill-ok ml-auto">Sent</span>
						{/if}
					</label>
				</li>
			{:else}
				<li class="px-3 py-6 text-center text-sm text-muted">No households match.</li>
			{/each}
		</ul>
	</section>

	<aside class="card h-fit p-5">
		<h2 class="text-sm font-semibold text-ink">Card</h2>

		<div class="mt-4 space-y-4">
			<div>
				<label class="label" for="preset">Size</label>
				<select id="preset" name="preset" class="field" bind:value={preset}>
					{#each data.presets as option (option.key)}
						<option value={option.key}>{option.label}</option>
					{/each}
					<option value="custom">Custom</option>
				</select>
			</div>

			{#if isCustom}
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="label" for="width">Width (in)</label>
						<input id="width" name="width" type="number" min="1" max="20" step="0.25" class="field" bind:value={width} />
					</div>
					<div>
						<label class="label" for="height">Height (in)</label>
						<input id="height" name="height" type="number" min="1" max="20" step="0.25" class="field" bind:value={height} />
					</div>
				</div>
			{/if}

			{#if !isInsertPreset}
				<fieldset>
					<legend class="label">Layout</legend>
					<label class="flex items-center gap-2 py-1 text-sm text-ink">
						<input type="radio" name="variant" value="full" bind:group={variant} class="accent-accent" />
						Full invitation
					</label>
					<label class="flex items-center gap-2 py-1 text-sm text-ink">
						<input type="radio" name="variant" value="insert" bind:group={variant} class="accent-accent" />
						QR insert card only
					</label>
				</fieldset>
			{:else}
				<input type="hidden" name="variant" value="insert" />
				<p class="text-xs text-muted">
					Insert sizes always print the QR-only card.
				</p>
			{/if}

			<div>
				<label class="label" for="format">Output</label>
				<select id="format" name="format" class="field" bind:value={format}>
					<option value="pdf">One PDF, a page per household</option>
					<option value="zip-pdf">ZIP of individual PDFs</option>
					<option value="zip-png">ZIP of QR code PNGs</option>
				</select>
			</div>
		</div>

		<div class="mt-5 space-y-2">
			<button type="submit" class="btn-primary w-full">Generate</button>
			<a href={previewHref} target="_blank" rel="noopener" class="btn-secondary w-full">
				Preview one card
			</a>
		</div>

		<dl class="mt-6 space-y-1.5 border-t border-line pt-4 text-xs text-muted">
			<div class="flex justify-between gap-3">
				<dt>Names</dt>
				<dd class="text-right text-ink">{data.details.coupleNames}</dd>
			</div>
			<div class="flex justify-between gap-3">
				<dt>Date</dt>
				<dd class="text-right text-ink">{data.details.dateLine}</dd>
			</div>
			<div class="flex justify-between gap-3">
				<dt>Venue</dt>
				<dd class="text-right text-ink">{data.details.venueName}</dd>
			</div>
		</dl>
		<a href="/settings" class="mt-3 inline-block text-xs text-accent hover:underline">
			Change this wording &rarr;
		</a>
	</aside>
</form>
