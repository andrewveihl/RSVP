<script lang="ts">
	import { untrack } from 'svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Seeded from the ?ids= the guest list linked here with, then owned by this page.
	let scope = $state(untrack(() => (data.preselected.length > 0 ? 'selected' : 'all')));
	let selected = $state(untrack(() => new Set<string>(data.preselected)));

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
</script>

<div>
	<h1 class="font-display text-2xl text-ink">Address labels</h1>
	<p class="mt-1 text-sm text-muted">
		Print-ready sheets for the standard Avery sizes, from the mailing addresses on file.
	</p>
</div>

{#if data.missingAddresses > 0}
	<p class="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
		{data.missingAddresses} household{data.missingAddresses === 1 ? ' has' : 's have'} no mailing
		address. They are skipped rather than printed as a bare name --
		<a class="underline" href="/guests">add their addresses</a> to include them.
	</p>
{/if}

<form method="POST" action="/labels/download" class="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
	<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />

	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">Who gets a label?</h2>

		<div class="mt-3 space-y-1.5">
			{#each [['all', 'Everyone'], ['attending', 'Attending only'], ['pending', 'Awaiting a reply'], ['unsent', 'Invitation not yet sent'], ['selected', 'Pick them below']] as [value, label] (value)}
				<label class="flex items-center gap-2 text-sm text-ink">
					<input type="radio" name="scope" {value} bind:group={scope} class="accent-accent" />
					{label}
				</label>
			{/each}
		</div>

		{#if scope === 'selected'}
			<ul class="mt-4 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
				{#each data.households as household (household.id)}
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
							{#if !household.mailingAddress}
								<span class="pill-warn ml-auto">No address</span>
							{/if}
						</label>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<aside class="card h-fit p-5">
		<h2 class="text-sm font-semibold text-ink">Sheet</h2>

		<div class="mt-4 space-y-4">
			<div>
				<label class="label" for="sheet">Label size</label>
				<select id="sheet" name="sheet" class="field">
					{#each data.sheets as sheet (sheet.key)}
						<option value={sheet.key}>{sheet.label}</option>
					{/each}
				</select>
			</div>

			<div>
				<label class="label" for="returnAddress">Return address</label>
				<textarea
					id="returnAddress"
					name="returnAddress"
					class="field"
					rows="3"
					placeholder="Optional -- printed small in the corner of each label"
				></textarea>
			</div>

			<div>
				<label class="label" for="skip">Skip labels</label>
				<input id="skip" name="skip" type="number" min="0" max="60" value="0" class="field" />
				<p class="mt-1 text-xs text-muted">
					Start part-way down a sheet you have already used some of.
				</p>
			</div>

			<label class="flex items-center gap-2 text-sm text-ink">
				<input type="checkbox" name="outlines" value="1" class="accent-accent" />
				Draw faint outlines
			</label>
			<p class="-mt-2 text-xs text-muted">
				Useful for a test print you hold up against a real sheet.
			</p>
		</div>

		<button type="submit" class="btn-primary mt-5 w-full">Generate PDF</button>
	</aside>
</form>
