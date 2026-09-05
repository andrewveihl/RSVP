<script lang="ts">
	import { untrack } from 'svelte';
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import { hiddenDetailsRows } from '$shared/details';
	import { dateLineMatches, formatLongDate } from '$shared/format';
	import type { DetailsField } from '$shared/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// A working copy, seeded once from the loaded content and then owned by this
	// form until it is saved. `untrack` marks that one-time read as deliberate.
	let extras = $state<DetailsField[]>(untrack(() => structuredClone(data.details.extras)));

	// The standard rows' wording, bound rather than read once. The panel below says
	// which rows will actually appear, and it can only tell the truth about a field
	// that has just been emptied if it is watching the field rather than the last save.
	let fields = $state<Record<string, string>>(
		untrack(() => Object.fromEntries(data.rows.map((row) => [row.field, data.details[row.field]])))
	);

	// Same one-time seeding for the row switches. Held as the set that is *shown*,
	// because that is what the checkboxes bind to; the server stores the inverse.
	let shown = $state<Record<string, boolean>>(
		untrack(() => {
			const hidden = hiddenDetailsRows(data.details);
			return Object.fromEntries(data.rows.map((row) => [row.id, !hidden.has(row.id)]));
		})
	);

	/** The wedding date from Settings, written the way the site's footer writes it. */
	const settingsDate = $derived(formatLongDate(data.weddingDate));

	// Checked live too, so retyping the line clears the warning as you go.
	const dateLineDisagrees = $derived(
		Boolean(settingsDate) && !dateLineMatches(fields.dateLine, data.weddingDate)
	);

	function add() {
		extras = [...extras, { id: `extra-new-${extras.length}-${Date.now()}`, label: '', value: '' }];
	}

	function remove(index: number) {
		extras = extras.filter((_, position) => position !== index);
	}
</script>

<ContentNav siteUrl={data.siteUrl} />
<Flash {form} />

<form method="POST" action="?/save" class="mt-5 space-y-4">
	<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
	<input type="hidden" name="extra_count" value={extras.length} />

	<section class="card grid gap-4 p-5 sm:grid-cols-2">
		<div class="sm:col-span-2">
			<label class="label" for="heading">Page heading</label>
			<input id="heading" name="heading" class="field" value={data.details.heading} />
		</div>

		<div>
			<label class="label" for="dateLine">Date</label>
			<input id="dateLine" name="dateLine" class="field" bind:value={fields.dateLine} />
			{#if dateLineDisagrees}
				<p class="mt-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
					Settings has the wedding on <strong>{settingsDate}</strong>, which is what the
					countdown, the footer and the calendar file all use. This line is what the Details
					page prints. Change whichever one is wrong.
				</p>
			{:else if settingsDate}
				<p class="mt-1 text-xs text-muted">
					Written however you like. The countdown and the footer use the wedding date in
					<a class="text-accent hover:underline" href="/settings">Settings</a>
					({settingsDate}).
				</p>
			{/if}
		</div>

		<div>
			<label class="label" for="timeLine">Time</label>
			<input id="timeLine" name="timeLine" class="field" bind:value={fields.timeLine} />
		</div>

		<div>
			<label class="label" for="venueName">Venue name</label>
			<input id="venueName" name="venueName" class="field" bind:value={fields.venueName} />
		</div>

		<div>
			<label class="label" for="mapUrl">Map link</label>
			<input
				id="mapUrl"
				name="mapUrl"
				type="url"
				class="field"
				placeholder="https://maps.google.com/..."
				value={data.details.mapUrl}
			/>
			<p class="mt-1 text-xs text-muted">
				A link, not an embed -- an embedded map would mean letting a third-party origin
				through the site's content security policy.
			</p>
		</div>

		<div class="sm:col-span-2">
			<label class="label" for="venueAddress">Venue address</label>
			<textarea
				id="venueAddress"
				name="venueAddress"
				class="field"
				rows="3"
				bind:value={fields.venueAddress}
			></textarea>
		</div>

		<div>
			<label class="label" for="dressCode">Dress code</label>
			<textarea
				id="dressCode"
				name="dressCode"
				class="field"
				rows="3"
				bind:value={fields.dressCode}
			></textarea>
		</div>

		<div>
			<label class="label" for="parking">Parking</label>
			<textarea
				id="parking"
				name="parking"
				class="field"
				rows="3"
				bind:value={fields.parking}
			></textarea>
		</div>
	</section>

	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">Which rows the page shows</h2>
		<p class="mt-1 text-xs text-muted">
			Switch a row off to leave it out -- the wording above is kept, so you can put it back
			without retyping it. An empty field is left out either way.
		</p>

		<ul class="mt-4 grid gap-1 sm:grid-cols-2">
			{#each data.rows as row (row.id)}
				{@const empty = !fields[row.field]?.trim()}
				<li>
					<label class="flex items-start gap-2 rounded-lg px-2 py-2 text-sm hover:bg-sunken">
						<input
							type="checkbox"
							name="show_{row.id}"
							value="1"
							bind:checked={shown[row.id]}
							class="mt-0.5 accent-accent"
						/>
						<span>
							<span class="text-ink">{row.label}</span>
							{#if empty}
								<span class="block text-xs text-muted">Empty, so it will not appear.</span>
							{:else if !shown[row.id]}
								<span class="block text-xs text-muted">Hidden on the site.</span>
							{/if}
						</span>
					</label>
				</li>
			{/each}
		</ul>
	</section>

	<section class="card p-5">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold text-ink">Anything else</h2>
			<button type="button" class="btn-secondary btn-sm" onclick={add}>Add a row</button>
		</div>
		<p class="mt-1 text-xs text-muted">Extra rows appear under the standard details.</p>

		<ul class="mt-4 space-y-3">
			{#each extras as extra, index (extra.id)}
				<li class="grid gap-3 sm:grid-cols-[12rem_1fr_auto]">
					<input type="hidden" name="extra_{index}_id" value={extra.id} />
					<input
						name="extra_{index}_label"
						class="field"
						placeholder="Label"
						value={extra.label}
						aria-label="Label for row {index + 1}"
					/>
					<input
						name="extra_{index}_value"
						class="field"
						placeholder="Value"
						value={extra.value}
						aria-label="Value for row {index + 1}"
					/>
					<button type="button" class="btn-ghost btn-sm text-bad" onclick={() => remove(index)}>
						Remove
					</button>
				</li>
			{/each}
		</ul>
	</section>

	<button type="submit" class="btn-primary">Save details</button>
</form>
