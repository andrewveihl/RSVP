<script lang="ts">
	import StatCard from '$lib/components/StatCard.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import { formatRelative, formatShortDate, pluralise } from '$shared/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const stats = $derived(data.stats);

	const segments = $derived([
		{ label: 'Attending', value: stats.attendingHouseholds, color: 'var(--viz-1)' },
		{ label: 'Declined', value: stats.declinedHouseholds, color: 'var(--viz-2)' },
		{ label: 'Pending', value: stats.pendingHouseholds, color: 'var(--viz-3)' }
	]);
</script>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="font-display text-2xl text-ink">Dashboard</h1>
		<p class="mt-1 text-sm text-muted">
			{#if data.daysToWedding !== null && data.daysToWedding > 0}
				{pluralise(data.daysToWedding, 'day')} to go.
			{/if}
			{#if data.deadlineLabel}
				RSVPs {data.deadlinePassed ? 'closed' : 'close'} {data.deadlineLabel}.
			{/if}
		</p>
	</div>

	<div class="flex flex-wrap gap-2">
		<a href="/guests?new=1" class="btn-secondary btn-sm">Add guest</a>
		<a href="/emails" class="btn-secondary btn-sm">Send reminders</a>
		<a href="/invitations" class="btn-secondary btn-sm">Invitations</a>
		<a href="/export/guests.csv" class="btn-secondary btn-sm" download>Export CSV</a>
	</div>
</div>

<section class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	<StatCard
		label="Households invited"
		value={stats.households}
		hint="{stats.invitedGuests} guests expected"
	/>
	<StatCard
		label="Responded"
		value={stats.responded}
		hint="{stats.responseRate}% of the guest list"
	/>
	<StatCard
		label="Attending"
		value={stats.attendingGuests}
		hint="{stats.attendingHouseholds} households, {stats.plusOnes} plus-ones"
		tone="ok"
	/>
	<StatCard
		label="Declined"
		value={stats.declinedHouseholds}
		hint="{stats.declinedGuests} seats freed"
		tone="bad"
	/>
</section>

<section class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	<StatCard label="Awaiting a reply" value={stats.pendingHouseholds} hint="{stats.pendingGuests} guests" tone="muted" />
	<StatCard label="Plus-ones added" value={stats.plusOnes} />
	<StatCard label="Invitations sent" value={stats.invitationsSent} hint="of {stats.households}" />
	<StatCard
		label="Expected head count"
		value={stats.attendingGuests}
		hint="attending replies only"
	/>
</section>

<div class="mt-6 grid gap-4 lg:grid-cols-3">
	<section class="card p-5 lg:col-span-2">
		<h2 class="text-sm font-semibold text-ink">Responses over time</h2>
		<p class="text-xs text-muted">Cumulative replies received.</p>
		<div class="mt-4">
			<LineChart points={data.timeline} />
		</div>
	</section>

	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">Where everyone stands</h2>
		<p class="text-xs text-muted">By household.</p>
		<div class="mt-5">
			<DonutChart {segments} />
		</div>
	</section>
</div>

<section class="card mt-4 p-5">
	<h2 class="text-sm font-semibold text-ink">Daily activity</h2>
	<p class="text-xs text-muted">Replies received over the last 30 days.</p>
	<div class="mt-4">
		<BarChart bars={data.activity} />
	</div>
</section>

<div class="mt-4 grid gap-4 lg:grid-cols-2">
	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">Recent activity</h2>
		{#if data.recent.length === 0}
			<p class="mt-4 text-sm text-muted">Nothing has happened yet.</p>
		{:else}
			<ul class="mt-3 divide-y divide-line text-sm">
				{#each data.recent as entry (entry.id)}
					<li class="flex items-start justify-between gap-4 py-2.5">
						<span class="text-ink">{entry.description}</span>
						<time class="shrink-0 text-xs text-muted" datetime={entry.createdAt}>
							{formatRelative(entry.createdAt)}
						</time>
					</li>
				{/each}
			</ul>
			<a href="/log" class="mt-4 inline-block text-xs text-accent hover:underline">
				Full activity log &rarr;
			</a>
		{/if}
	</section>

	<div class="space-y-4">
		<section class="card p-5">
			<h2 class="text-sm font-semibold text-ink">By batch</h2>
			{#if data.batches.length === 0}
				<p class="mt-4 text-sm text-muted">No guests yet.</p>
			{:else}
				<table class="mt-3 w-full text-sm">
					<thead>
						<tr class="border-b border-line">
							<th class="table-head">Batch</th>
							<th class="table-head text-right">Sent</th>
							<th class="table-head text-right">Replied</th>
							<th class="table-head text-right">Rate</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.batches as batch (batch.batch)}
							<tr>
								<td class="table-cell text-ink">{batch.batch}</td>
								<td class="table-cell text-right tabular-nums text-muted">{batch.households}</td>
								<td class="table-cell text-right tabular-nums text-muted">{batch.responded}</td>
								<td class="table-cell text-right tabular-nums text-ink">{batch.responseRate}%</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section class="card p-5">
			<h2 class="text-sm font-semibold text-ink">Reminder effectiveness</h2>
			<p class="text-xs text-muted">Replies within 48 hours of each batch.</p>
			{#if data.reminders.length === 0}
				<p class="mt-4 text-sm text-muted">No reminders sent yet.</p>
			{:else}
				<ul class="mt-3 divide-y divide-line text-sm">
					{#each data.reminders as reminder (reminder.sentAt)}
						<li class="flex items-center justify-between gap-4 py-2.5">
							<span class="text-muted">{formatShortDate(reminder.sentAt)}</span>
							<span class="text-xs text-muted">{reminder.recipients} sent</span>
							<span class="font-semibold tabular-nums text-ink">
								+{reminder.responsesWithin48h}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>
