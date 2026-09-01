<script lang="ts">
	import { untrack } from 'svelte';
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { DetailsField } from '$shared/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// A working copy, seeded once from the loaded content and then owned by this
	// form until it is saved. `untrack` marks that one-time read as deliberate.
	let extras = $state<DetailsField[]>(untrack(() => structuredClone(data.details.extras)));

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
			<input id="dateLine" name="dateLine" class="field" value={data.details.dateLine} />
		</div>

		<div>
			<label class="label" for="timeLine">Time</label>
			<input id="timeLine" name="timeLine" class="field" value={data.details.timeLine} />
		</div>

		<div>
			<label class="label" for="venueName">Venue name</label>
			<input id="venueName" name="venueName" class="field" value={data.details.venueName} />
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
			<textarea id="venueAddress" name="venueAddress" class="field" rows="3"
				>{data.details.venueAddress}</textarea>
		</div>

		<div>
			<label class="label" for="dressCode">Dress code</label>
			<textarea id="dressCode" name="dressCode" class="field" rows="3"
				>{data.details.dressCode}</textarea>
		</div>

		<div>
			<label class="label" for="parking">Parking</label>
			<textarea id="parking" name="parking" class="field" rows="3">{data.details.parking}</textarea>
		</div>
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
