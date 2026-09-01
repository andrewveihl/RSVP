<script lang="ts">
	import { page } from '$app/state';
	import { formatDateTime, formatRelative } from '$shared/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function pageLink(target: number): string {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(target));
		return `?${params.toString()}`;
	}
</script>

<div>
	<h1 class="font-display text-2xl text-ink">Activity</h1>
	<p class="mt-1 text-sm text-muted">
		Every change, timestamped. {data.total} entr{data.total === 1 ? 'y' : 'ies'}.
	</p>
</div>

<form method="GET" class="card mt-4 flex flex-wrap items-end gap-3 p-4">
	<div class="min-w-[12rem] flex-1">
		<label class="label" for="q">Search</label>
		<input id="q" name="q" class="field" placeholder="Description" value={data.filters.search} />
	</div>

	<div>
		<label class="label" for="type">Event</label>
		<select id="type" name="type" class="field">
			<option value="all">All events</option>
			{#each data.types as type (type.value)}
				<option value={type.value} selected={data.filters.type === type.value}>{type.label}</option>
			{/each}
		</select>
	</div>

	<div>
		<label class="label" for="household">Household</label>
		<select id="household" name="household" class="field">
			<option value="">Anyone</option>
			{#each data.households as household (household.id)}
				<option value={household.id} selected={data.filters.household === household.id}>
					{household.name}
				</option>
			{/each}
		</select>
	</div>

	<div>
		<label class="label" for="from">From</label>
		<input id="from" name="from" type="date" class="field" value={data.filters.from} />
	</div>

	<div>
		<label class="label" for="to">To</label>
		<input id="to" name="to" type="date" class="field" value={data.filters.to} />
	</div>

	<button type="submit" class="btn-secondary">Apply</button>
	<a href="/log" class="btn-ghost">Reset</a>
</form>

<div class="card mt-3 overflow-x-auto">
	<table class="w-full min-w-[40rem] text-sm">
		<thead>
			<tr class="border-b border-line">
				<th class="table-head">When</th>
				<th class="table-head">Event</th>
				<th class="table-head">What happened</th>
				<th class="table-head">From</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-line">
			{#each data.entries as entry (entry.id)}
				<tr class="hover:bg-sunken/60">
					<td class="table-cell whitespace-nowrap">
						<time datetime={entry.createdAt} title={formatDateTime(entry.createdAt)} class="text-muted">
							{formatRelative(entry.createdAt)}
						</time>
					</td>
					<td class="table-cell whitespace-nowrap text-xs text-muted">{entry.eventType}</td>
					<td class="table-cell text-ink">
						{entry.description}
						{#if entry.householdId}
							<a class="ml-2 text-xs text-accent hover:underline" href="/guests/{entry.householdId}">
								open
							</a>
						{/if}
					</td>
					<td class="table-cell whitespace-nowrap text-xs text-muted">{entry.ipAddress ?? '--'}</td>
				</tr>
			{:else}
				<tr>
					<td colspan="4" class="table-cell py-10 text-center text-muted">
						Nothing matches these filters.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if data.pageCount > 1}
	<nav class="mt-4 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
		<a href={pageLink(Math.max(1, data.page - 1))} class="btn-ghost btn-sm">Previous</a>
		<span class="text-muted">Page {data.page} of {data.pageCount}</span>
		<a href={pageLink(Math.min(data.pageCount, data.page + 1))} class="btn-ghost btn-sm">Next</a>
	</nav>
{/if}
