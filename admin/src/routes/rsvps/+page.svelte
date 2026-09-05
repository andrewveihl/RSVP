<script lang="ts">
	import { untrack } from 'svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import { formatDateTime } from '$shared/format';
	import type { HouseholdWithRsvp } from '$shared/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Seeded from ?household=, which is how the guest detail page links straight into
	// recording a reply; after that the panel owns both.
	let editing = $state<HouseholdWithRsvp | null>(untrack(() => data.editing));
	let attending = $state<'yes' | 'no'>(
		untrack(() => (data.editing?.rsvp?.attending === false ? 'no' : 'yes'))
	);

	function edit(household: HouseholdWithRsvp) {
		editing = household;
		attending = household.rsvp?.attending === false ? 'no' : 'yes';
	}

	const withReply = $derived(data.households.filter((household) => household.rsvp !== null));
	const withoutReply = $derived(data.households.filter((household) => household.rsvp === null));
</script>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="font-display text-2xl text-ink">RSVPs</h1>
		<p class="mt-1 text-sm text-muted">
			{withReply.length} replied &middot; {withoutReply.length} still to hear from.
		</p>
	</div>
</div>

<Flash {form} />

{#if data.closed}
	<p class="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
		The RSVP deadline has passed, so guests can no longer reply themselves. You can still
		record a reply here for anyone who gets in touch.
	</p>
{/if}

{#if editing}
	<section class="card mt-4 p-5">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold text-ink">Reply for {editing.name}</h2>
			<button type="button" class="btn-ghost btn-sm" onclick={() => (editing = null)}>Close</button>
		</div>

		<form method="POST" action="?/save" class="mt-4 space-y-4">
			<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
			<input type="hidden" name="householdId" value={editing.id} />

			<fieldset>
				<legend class="label">Attending?</legend>
				<div class="flex gap-4">
					<label class="flex items-center gap-2 text-sm text-ink">
						<input type="radio" name="attending" value="yes" bind:group={attending} class="accent-accent" />
						Yes
					</label>
					<label class="flex items-center gap-2 text-sm text-ink">
						<input type="radio" name="attending" value="no" bind:group={attending} class="accent-accent" />
						No
					</label>
				</div>
			</fieldset>

			<div class:hidden={attending === 'no'}>
				<label class="label" for="guestTotal">How many are coming?</label>
				<input
					id="guestTotal"
					name="guestTotal"
					type="number"
					min="1"
					max="50"
					class="field sm:w-40"
					value={editing.rsvp ? editing.rsvp.guestCount + editing.rsvp.plusOneCount : editing.partySize}
				/>
				<p class="mt-1 text-xs text-muted">
					One number, exactly as the guest is asked. Invited {editing.partySize}; anything
					above that is recorded as a plus-one.
					{#if editing.maxExtraGuests !== null}
						Their own form stops at {editing.partySize + editing.maxExtraGuests}, but you are
						not held to that here.
					{/if}
				</p>
			</div>

			<div class="flex flex-wrap gap-2">
				<button type="submit" class="btn-primary">Save reply</button>
				<a href="/guests/{editing.id}" class="btn-ghost">Open household</a>
			</div>
		</form>

		{#if editing.rsvp}
			<form method="POST" action="?/clear" class="mt-5 border-t border-line pt-4">
				<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
				<input type="hidden" name="householdId" value={editing.id} />
				<button
					type="submit"
					class="btn-danger btn-sm"
					onclick={(event) => {
						if (!confirm('Clear this reply and set them back to pending?')) event.preventDefault();
					}}
				>
					Clear this reply
				</button>
			</form>
		{/if}
	</section>
{/if}

<div class="card mt-4 overflow-x-auto">
	<table class="w-full min-w-[44rem] text-sm">
		<thead>
			<tr class="border-b border-line">
				<th class="table-head">Household</th>
				<th class="table-head">Status</th>
				<th class="table-head text-right">Guests</th>
				<th class="table-head text-right">+1s</th>
				<th class="table-head text-right">Total</th>
				<th class="table-head">Replied</th>
				<th class="table-head"></th>
			</tr>
		</thead>
		<tbody class="divide-y divide-line">
			{#each data.households as household (household.id)}
				<tr class="hover:bg-sunken/60">
					<td class="table-cell">
						<a class="font-medium text-ink hover:text-accent" href="/guests/{household.id}">
							{household.name}
						</a>
					</td>
					<td class="table-cell"><StatusPill status={household.status} /></td>
					<td class="table-cell text-right tabular-nums text-muted">
						{household.rsvp?.guestCount ?? '--'}
					</td>
					<td class="table-cell text-right tabular-nums text-muted">
						{household.rsvp?.plusOneCount ?? '--'}
					</td>
					<td class="table-cell text-right tabular-nums text-ink">
						{household.status === 'attending' ? household.attendingTotal : '--'}
					</td>
					<td class="table-cell whitespace-nowrap text-xs text-muted">
						{household.rsvp ? formatDateTime(household.rsvp.submittedAt) : '--'}
					</td>
					<td class="table-cell text-right">
						<button type="button" class="btn-ghost btn-sm" onclick={() => edit(household)}>
							{household.rsvp ? 'Edit' : 'Record'}
						</button>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="7" class="table-cell py-10 text-center text-muted">
						No households yet. <a class="text-accent hover:underline" href="/guests">Add some</a>.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
