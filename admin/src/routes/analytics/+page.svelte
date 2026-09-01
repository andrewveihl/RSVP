<script lang="ts">
	import StatCard from '$lib/components/StatCard.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import { formatShortDate, percent } from '$shared/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const stats = $derived(data.stats);

	const segments = $derived([
		{ label: 'Attending', value: stats.attendingHouseholds, color: 'var(--viz-1)' },
		{ label: 'Declined', value: stats.declinedHouseholds, color: 'var(--viz-2)' },
		{ label: 'Pending', value: stats.pendingHouseholds, color: 'var(--viz-3)' }
	]);

	let showTable = $state(false);
</script>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="font-display text-2xl text-ink">Analytics</h1>
		<p class="mt-1 text-sm text-muted">How the guest list is filling up.</p>
	</div>
	<div class="flex gap-2">
		<button type="button" class="btn-secondary btn-sm" onclick={() => (showTable = !showTable)}>
			{showTable ? 'Hide' : 'Show'} the numbers
		</button>
		<a href="/export/timeline.csv" class="btn-secondary btn-sm" download>Export timeline CSV</a>
	</div>
</div>

<section class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	<StatCard label="Response rate" value="{stats.responseRate}%" hint="{stats.responded} of {stats.households}" />
	<StatCard
		label="Expected head count"
		value={stats.attendingGuests}
		hint="{percent(stats.attendingGuests, stats.invitedGuests)}% of those invited"
		tone="ok"
	/>
	<StatCard label="Plus-ones" value={stats.plusOnes} hint="beyond the invited party sizes" />
	<StatCard
		label="Still to hear from"
		value={stats.pendingHouseholds}
		hint="{stats.pendingGuests} guests unaccounted for"
		tone="muted"
	/>
</section>

<div class="mt-4 grid gap-4 lg:grid-cols-3">
	<section class="card p-5 lg:col-span-2">
		<h2 class="text-sm font-semibold text-ink">Responses over time</h2>
		<p class="text-xs text-muted">Cumulative replies received.</p>
		<div class="mt-4">
			<LineChart points={data.timeline} />
		</div>
	</section>

	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">Status</h2>
		<p class="text-xs text-muted">By household.</p>
		<div class="mt-5">
			<DonutChart {segments} />
		</div>
	</section>
</div>

<section class="card mt-4 p-5">
	<h2 class="text-sm font-semibold text-ink">Daily replies</h2>
	<p class="text-xs text-muted">The last 60 days.</p>
	<div class="mt-4">
		<BarChart bars={data.activity} height={180} />
	</div>
</section>

{#if showTable}
	<!-- The table view. Every value the charts encode is reachable here without a
	     pointer, which is what lets the charts stay sparingly labelled. -->
	<section class="card mt-4 overflow-x-auto p-5">
		<h2 class="text-sm font-semibold text-ink">The numbers</h2>
		<table class="mt-3 w-full min-w-[32rem] text-sm">
			<thead>
				<tr class="border-b border-line">
					<th class="table-head">Date</th>
					<th class="table-head text-right">Replies</th>
					<th class="table-head text-right">Attending</th>
					<th class="table-head text-right">Declined</th>
					<th class="table-head text-right">Cumulative</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-line">
				{#each data.timeline as point (point.date)}
					<tr>
						<td class="table-cell text-muted">{formatShortDate(point.date)}</td>
						<td class="table-cell text-right tabular-nums text-ink">{point.responses}</td>
						<td class="table-cell text-right tabular-nums text-muted">{point.attending}</td>
						<td class="table-cell text-right tabular-nums text-muted">{point.declined}</td>
						<td class="table-cell text-right tabular-nums text-ink">{point.cumulative}</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="table-cell py-8 text-center text-muted">No replies yet.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/if}

<div class="mt-4 grid gap-4 lg:grid-cols-2">
	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">By invitation batch</h2>
		<table class="mt-3 w-full text-sm">
			<thead>
				<tr class="border-b border-line">
					<th class="table-head">Batch</th>
					<th class="table-head text-right">Households</th>
					<th class="table-head text-right">Replied</th>
					<th class="table-head text-right">Attending</th>
					<th class="table-head text-right">Rate</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-line">
				{#each data.batches as batch (batch.batch)}
					<tr>
						<td class="table-cell text-ink">{batch.batch}</td>
						<td class="table-cell text-right tabular-nums text-muted">{batch.households}</td>
						<td class="table-cell text-right tabular-nums text-muted">{batch.responded}</td>
						<td class="table-cell text-right tabular-nums text-muted">{batch.attending}</td>
						<td class="table-cell text-right tabular-nums text-ink">{batch.responseRate}%</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="table-cell py-8 text-center text-muted">No guests yet.</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="mt-3 text-xs text-muted">
			Tag households with a batch on the guest list to compare mailings.
		</p>
	</section>

	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">Reminder effectiveness</h2>
		<p class="text-xs text-muted">
			Replies received in the 48 hours after each batch went out. Correlation, not proof --
			some of those would have arrived anyway.
		</p>
		<table class="mt-3 w-full text-sm">
			<thead>
				<tr class="border-b border-line">
					<th class="table-head">Sent</th>
					<th class="table-head text-right">Recipients</th>
					<th class="table-head text-right">Replies in 48h</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-line">
				{#each data.reminders as reminder (reminder.sentAt)}
					<tr>
						<td class="table-cell text-muted">{formatShortDate(reminder.sentAt)}</td>
						<td class="table-cell text-right tabular-nums text-muted">{reminder.recipients}</td>
						<td class="table-cell text-right tabular-nums text-ink">
							{reminder.responsesWithin48h}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="3" class="table-cell py-8 text-center text-muted">
							No reminders sent yet.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>
