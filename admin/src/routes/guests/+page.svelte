<script lang="ts">
	import { page } from '$app/state';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import GuestForm from '$lib/components/GuestForm.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import { formatShortDate } from '$shared/format';
	import type { HouseholdWithRsvp } from '$shared/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showNew = $state(page.url.searchParams.get('new') === '1');
	let editing = $state<HouseholdWithRsvp | null>(null);
	let selected = $state(new Set<string>());
	let confirmingBulkDelete = $state(false);

	const allSelected = $derived(
		data.households.length > 0 && data.households.every((h) => selected.has(h.id))
	);

	function toggleAll() {
		const next = new Set(selected);
		if (allSelected) {
			for (const household of data.households) next.delete(household.id);
		} else {
			for (const household of data.households) next.add(household.id);
		}
		selected = next;
	}

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	/** Builds a URL that keeps the current filters and changes one parameter. */
	function withParam(key: string, value: string): string {
		const params = new URLSearchParams(page.url.searchParams);
		if (value) params.set(key, value);
		else params.delete(key);
		// Any change to filters or sort invalidates the page number.
		if (key !== 'page') params.delete('page');
		return `?${params.toString()}`;
	}

	function sortLink(column: string): string {
		const flip = data.filters.sort === column && data.filters.direction === 'asc' ? 'desc' : 'asc';
		const params = new URLSearchParams(page.url.searchParams);
		params.set('sort', column);
		params.set('dir', flip);
		params.delete('page');
		return `?${params.toString()}`;
	}

	const sortMark = (column: string) =>
		data.filters.sort === column ? (data.filters.direction === 'asc' ? ' ↑' : ' ↓') : '';
</script>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="font-display text-2xl text-ink">Guests</h1>
		<p class="mt-1 text-sm text-muted">
			{data.total} household{data.total === 1 ? '' : 's'} match{data.total === 1 ? 'es' : ''} these
			filters.
		</p>
	</div>

	<div class="flex flex-wrap gap-2">
		<a href="/guests/import" class="btn-secondary btn-sm">Import CSV</a>
		<a href="/export/guests.csv" class="btn-secondary btn-sm" download>Export CSV</a>
		<button type="button" class="btn-primary btn-sm" onclick={() => (showNew = !showNew)}>
			{showNew ? 'Close' : 'Add household'}
		</button>
	</div>
</div>

<Flash {form} />

{#if showNew}
	<section class="card mt-4 p-5">
		<h2 class="mb-4 text-sm font-semibold text-ink">New household</h2>
		<GuestForm csrfToken={data.csrfToken} onCancel={() => (showNew = false)} />
	</section>
{/if}

<!-- Filters in one row above the table: they scope everything below them. -->
<form method="GET" class="card mt-4 flex flex-wrap items-end gap-3 p-4">
	<div class="min-w-[12rem] flex-1">
		<label class="label" for="q">Search</label>
		<input id="q" name="q" class="field" placeholder="Name or email" value={data.filters.search} />
	</div>

	<div>
		<label class="label" for="status">Status</label>
		<select id="status" name="status" class="field">
			<option value="all" selected={data.filters.status === 'all'}>All</option>
			<option value="attending" selected={data.filters.status === 'attending'}>Attending</option>
			<option value="declined" selected={data.filters.status === 'declined'}>Declined</option>
			<option value="pending" selected={data.filters.status === 'pending'}>Pending</option>
		</select>
	</div>

	<div>
		<label class="label" for="invitation">Invitation</label>
		<select id="invitation" name="invitation" class="field">
			<option value="all" selected={data.filters.invitation === 'all'}>All</option>
			<option value="sent" selected={data.filters.invitation === 'sent'}>Sent</option>
			<option value="unsent" selected={data.filters.invitation === 'unsent'}>Not sent</option>
		</select>
	</div>

	{#if data.batches.length > 0}
		<div>
			<label class="label" for="batch">Batch</label>
			<select id="batch" name="batch" class="field">
				<option value="">All</option>
				{#each data.batches as batch (batch)}
					<option value={batch} selected={data.filters.batch === batch}>{batch}</option>
				{/each}
			</select>
		</div>
	{/if}

	{#if data.sides.length > 0}
		<div>
			<label class="label" for="side">Side</label>
			<select id="side" name="side" class="field">
				<option value="">All</option>
				{#each data.sides as side (side)}
					<option value={side} selected={data.filters.side === side}>{side}</option>
				{/each}
			</select>
		</div>
	{/if}

	<input type="hidden" name="sort" value={data.filters.sort} />
	<input type="hidden" name="dir" value={data.filters.direction} />

	<button type="submit" class="btn-secondary">Apply</button>
	<a href="/guests" class="btn-ghost">Reset</a>
</form>

{#if selected.size > 0}
	<div class="card mt-3 flex flex-wrap items-center gap-2 p-3">
		<span class="text-sm text-muted">{selected.size} selected</span>

		<form method="POST" action="?/bulkInvitation" class="contents">
			<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
			{#each [...selected] as id (id)}
				<input type="hidden" name="ids" value={id} />
			{/each}
			<button type="submit" name="sent" value="1" class="btn-secondary btn-sm">
				Mark invitation sent
			</button>
			<button type="submit" name="sent" value="0" class="btn-ghost btn-sm">Mark not sent</button>
		</form>

		<a href="/invitations?ids={[...selected].join(',')}" class="btn-secondary btn-sm">
			Make invitations
		</a>
		<a href="/labels?ids={[...selected].join(',')}" class="btn-secondary btn-sm">Make labels</a>

		{#if confirmingBulkDelete}
			<form method="POST" action="?/bulkDelete" class="contents">
				<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
				{#each [...selected] as id (id)}
					<input type="hidden" name="ids" value={id} />
				{/each}
				<button type="submit" class="btn-danger btn-sm">
					Really delete {selected.size}?
				</button>
			</form>
			<button type="button" class="btn-ghost btn-sm" onclick={() => (confirmingBulkDelete = false)}>
				Cancel
			</button>
		{:else}
			<button type="button" class="btn-danger btn-sm ml-auto" onclick={() => (confirmingBulkDelete = true)}>
				Delete selected
			</button>
		{/if}
	</div>
{/if}

<div class="card mt-3 overflow-x-auto">
	<table class="w-full min-w-[52rem] text-sm">
		<thead>
			<tr class="border-b border-line">
				<th class="table-head w-8">
					<input
						type="checkbox"
						checked={allSelected}
						onchange={toggleAll}
						aria-label="Select all on this page"
					/>
				</th>
				<th class="table-head"><a class="hover:text-ink" href={sortLink('name')}>Name{sortMark('name')}</a></th>
				<th class="table-head"><a class="hover:text-ink" href={sortLink('email')}>Contact{sortMark('email')}</a></th>
				<th class="table-head text-right"><a class="hover:text-ink" href={sortLink('party_size')}>Party{sortMark('party_size')}</a></th>
				<th class="table-head"><a class="hover:text-ink" href={sortLink('status')}>Status{sortMark('status')}</a></th>
				<th class="table-head text-right"><a class="hover:text-ink" href={sortLink('plus_ones')}>+1s{sortMark('plus_ones')}</a></th>
				<th class="table-head"><a class="hover:text-ink" href={sortLink('invitation_sent')}>Invite{sortMark('invitation_sent')}</a></th>
				<th class="table-head"><a class="hover:text-ink" href={sortLink('updated_at')}>Updated{sortMark('updated_at')}</a></th>
				<th class="table-head"></th>
			</tr>
		</thead>

		<tbody class="divide-y divide-line">
			{#each data.households as household (household.id)}
				<tr class="hover:bg-sunken/60">
					<td class="table-cell">
						<input
							type="checkbox"
							checked={selected.has(household.id)}
							onchange={() => toggle(household.id)}
							aria-label="Select {household.name}"
						/>
					</td>
					<td class="table-cell">
						<a class="font-medium text-ink hover:text-accent" href="/guests/{household.id}">
							{household.name}
						</a>
						{#if household.batch}
							<span class="ml-2 text-xs text-muted">{household.batch}</span>
						{/if}
					</td>
					<td class="table-cell text-muted">
						{household.email ?? household.phone ?? '--'}
					</td>
					<td class="table-cell text-right tabular-nums text-muted">{household.partySize}</td>
					<td class="table-cell"><StatusPill status={household.status} /></td>
					<td class="table-cell text-right tabular-nums text-muted">
						{household.rsvp?.plusOneCount ?? 0}
					</td>
					<td class="table-cell">
						{#if household.invitationSent}
							<span class="pill-ok">Sent</span>
						{:else}
							<span class="pill-muted">No</span>
						{/if}
					</td>
					<td class="table-cell whitespace-nowrap text-xs text-muted">
						{formatShortDate(household.updatedAt)}
					</td>
					<td class="table-cell text-right">
						<button type="button" class="btn-ghost btn-sm" onclick={() => (editing = household)}>
							Edit
						</button>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="9" class="table-cell py-10 text-center text-muted">
						No households match these filters.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if data.pageCount > 1}
	<nav class="mt-4 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
		<a
			href={withParam('page', String(Math.max(1, data.page - 1)))}
			class="btn-ghost btn-sm"
			aria-disabled={data.page === 1}
		>
			Previous
		</a>
		<span class="text-muted">Page {data.page} of {data.pageCount}</span>
		<a
			href={withParam('page', String(Math.min(data.pageCount, data.page + 1)))}
			class="btn-ghost btn-sm"
			aria-disabled={data.page === data.pageCount}
		>
			Next
		</a>
	</nav>
{/if}

<datalist id="batch-options">
	{#each data.batches as batch (batch)}
		<option value={batch}></option>
	{/each}
</datalist>

<!-- Free-form, so this only suggests what has already been typed elsewhere. -->
<datalist id="side-options">
	{#each data.sides as side (side)}
		<option value={side}></option>
	{/each}
</datalist>

{#if editing}
	<!-- Editing happens in a modal dialog so the table's scroll position, filters and
	     selection all survive the edit. -->
	<div class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
		<div class="card mt-10 w-full max-w-2xl p-6">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-ink">Edit {editing.name}</h2>
				<button type="button" class="btn-ghost btn-sm" onclick={() => (editing = null)}>Close</button>
			</div>

			<GuestForm csrfToken={data.csrfToken} household={editing} onCancel={() => (editing = null)} />

			<form method="POST" action="?/delete" class="mt-6 border-t border-line pt-4">
				<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
				<input type="hidden" name="id" value={editing.id} />
				<button
					type="submit"
					class="btn-danger btn-sm"
					onclick={(event) => {
						if (!confirm(`Delete ${editing?.name}? Their RSVP goes too.`)) event.preventDefault();
					}}
				>
					Delete household
				</button>
			</form>
		</div>
	</div>
{/if}
