<script lang="ts">
	/**
	 * The add / edit household form, shared by the new-guest panel and the edit dialog
	 * so the two can never drift apart in what they accept.
	 */
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { HouseholdWithRsvp } from '$shared/types';

	let {
		csrfToken,
		household = null,
		onCancel = undefined
	}: {
		csrfToken: string;
		household?: HouseholdWithRsvp | null;
		onCancel?: () => void;
	} = $props();

	const editing = $derived(household !== null);
</script>

<form method="POST" action={editing ? '?/update' : '?/create'} class="space-y-4">
	<input type="hidden" name={CSRF_FIELD} value={csrfToken} />
	{#if household}
		<input type="hidden" name="id" value={household.id} />
	{/if}

	<div class="grid gap-4 sm:grid-cols-2">
		<div class="sm:col-span-2">
			<label class="label" for="name">Household name</label>
			<input
				id="name"
				name="name"
				class="field"
				required
				maxlength="200"
				placeholder="The Whitfield Family"
				value={household?.name ?? ''}
			/>
		</div>

		<div>
			<label class="label" for="email">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				class="field"
				placeholder="optional"
				value={household?.email ?? ''}
			/>
		</div>

		<div>
			<label class="label" for="phone">Phone</label>
			<input id="phone" name="phone" class="field" placeholder="optional" value={household?.phone ?? ''} />
		</div>

		<div>
			<label class="label" for="partySize">Expected party size</label>
			<input
				id="partySize"
				name="partySize"
				type="number"
				min="1"
				max="50"
				step="1"
				class="field"
				value={household?.partySize ?? 1}
			/>
		</div>

		<div>
			<label class="label" for="maxExtraGuests">Extra guests allowed</label>
			<input
				id="maxExtraGuests"
				name="maxExtraGuests"
				type="number"
				min="0"
				max="20"
				step="1"
				class="field"
				placeholder="No limit"
				value={household?.maxExtraGuests ?? ''}
			/>
			<p class="mt-1 text-xs text-muted">
				How many people they may add <em>on top of</em> the party size -- 1 for a partner,
				0 for a family whose children are already counted. Leave it empty for no limit.
			</p>
		</div>

		<div>
			<label class="label" for="batch">Batch</label>
			<input
				id="batch"
				name="batch"
				class="field"
				list="batch-options"
				placeholder="e.g. Save the dates"
				value={household?.batch ?? ''}
			/>
		</div>

		<div>
			<label class="label" for="side">Side</label>
			<input
				id="side"
				name="side"
				class="field"
				list="side-options"
				placeholder="Optional"
				value={household?.side ?? ''}
			/>
		</div>

		<div class="sm:col-span-2">
			<label class="label" for="mailingAddress">Mailing address</label>
			<textarea
				id="mailingAddress"
				name="mailingAddress"
				class="field"
				rows="3"
				placeholder="One line per line of the label">{household?.mailingAddress ?? ''}</textarea>
		</div>

		<div class="sm:col-span-2">
			<label class="label" for="notes">Notes</label>
			<textarea id="notes" name="notes" class="field" rows="2">{household?.notes ?? ''}</textarea>
		</div>
	</div>

	<div class="flex flex-wrap gap-2">
		<button type="submit" class="btn-primary">
			{editing ? 'Save changes' : 'Add household'}
		</button>
		{#if onCancel}
			<button type="button" class="btn-ghost" onclick={onCancel}>Cancel</button>
		{/if}
	</div>
</form>
