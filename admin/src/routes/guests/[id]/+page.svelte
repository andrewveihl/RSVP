<script lang="ts">
	import StatusPill from '$lib/components/StatusPill.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import { formatDateTime, formatRelative } from '$shared/format';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const household = $derived(data.household);
	let copied = $state(false);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(data.link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard access can be refused; the link is visible and selectable anyway.
		}
	}
</script>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<a href="/guests" class="text-xs text-muted hover:text-ink">&larr; All guests</a>
		<h1 class="mt-1 font-display text-2xl text-ink">{household.name}</h1>
	</div>
	<StatusPill status={household.status} />
</div>

<Flash {form} />

<div class="mt-5 grid gap-4 lg:grid-cols-3">
	<section class="card p-5 lg:col-span-2">
		<h2 class="text-sm font-semibold text-ink">Details</h2>
		<dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted">Email</dt>
				<dd class="text-ink">{household.email ?? '--'}</dd>
			</div>
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted">Phone</dt>
				<dd class="text-ink">{household.phone ?? '--'}</dd>
			</div>
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted">Expected party</dt>
				<dd class="text-ink">{household.partySize}</dd>
			</div>
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted">Batch</dt>
				<dd class="text-ink">{household.batch ?? '--'}</dd>
			</div>
			<div class="sm:col-span-2">
				<dt class="text-xs uppercase tracking-wide text-muted">Mailing address</dt>
				<dd class="whitespace-pre-line text-ink">{household.mailingAddress ?? '--'}</dd>
			</div>
			{#if household.notes}
				<div class="sm:col-span-2">
					<dt class="text-xs uppercase tracking-wide text-muted">Notes</dt>
					<dd class="whitespace-pre-line text-ink">{household.notes}</dd>
				</div>
			{/if}
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted">Invitation</dt>
				<dd class="text-ink">
					{household.invitationSent
						? `Sent ${formatDateTime(household.invitationSentAt)}`
						: 'Not sent'}
				</dd>
			</div>
		</dl>

		<h2 class="mt-7 text-sm font-semibold text-ink">RSVP</h2>
		{#if household.rsvp}
			<dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted">Answer</dt>
					<dd class="text-ink">{household.rsvp.attending ? 'Attending' : 'Not attending'}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted">Guests</dt>
					<dd class="text-ink">
						{household.rsvp.guestCount} + {household.rsvp.plusOneCount} = {household.attendingTotal}
					</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted">Replied</dt>
					<dd class="text-ink">{formatDateTime(household.rsvp.submittedAt)}</dd>
				</div>
			</dl>
			<a href="/rsvps?household={household.id}" class="mt-4 inline-block text-xs text-accent hover:underline">
				Edit this reply &rarr;
			</a>
		{:else}
			<p class="mt-3 text-sm text-muted">No reply yet.</p>
			<a href="/rsvps?household={household.id}" class="mt-3 inline-block text-xs text-accent hover:underline">
				Record a reply on their behalf &rarr;
			</a>
		{/if}
	</section>

	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">Their RSVP link</h2>
		<img src={data.qr} alt="QR code for {household.name}" class="mt-4 w-full rounded-lg border border-line bg-white" />

		<p class="mt-3 break-all rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{data.link}</p>

		<div class="mt-3 flex flex-wrap gap-2">
			<button type="button" class="btn-secondary btn-sm" onclick={copyLink}>
				{copied ? 'Copied' : 'Copy link'}
			</button>
			<a href="/qr/{household.id}.png" class="btn-secondary btn-sm" download>PNG</a>
			<a href="/qr/{household.id}.svg" class="btn-secondary btn-sm" download>SVG</a>
		</div>

		<form method="POST" action="?/rotateToken" class="mt-5 border-t border-line pt-4">
			<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
			<button
				type="submit"
				class="btn-danger btn-sm"
				onclick={(event) => {
					if (
						!confirm(
							'Issue a new link? Any invitation already printed or emailed for this household will stop working.'
						)
					)
						event.preventDefault();
				}}
			>
				Issue a new link
			</button>
		</form>
	</section>
</div>

<div class="mt-4 grid gap-4 lg:grid-cols-2">
	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">Activity</h2>
		{#if data.activity.length === 0}
			<p class="mt-3 text-sm text-muted">Nothing recorded yet.</p>
		{:else}
			<ul class="mt-3 divide-y divide-line text-sm">
				{#each data.activity as entry (entry.id)}
					<li class="flex items-start justify-between gap-4 py-2.5">
						<span class="text-ink">{entry.description}</span>
						<time class="shrink-0 text-xs text-muted" datetime={entry.createdAt}>
							{formatRelative(entry.createdAt)}
						</time>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">Emails</h2>
		{#if data.emails.length === 0}
			<p class="mt-3 text-sm text-muted">No emails sent to this household.</p>
		{:else}
			<ul class="mt-3 divide-y divide-line text-sm">
				{#each data.emails as entry (entry.id)}
					<li class="py-2.5">
						<div class="flex items-start justify-between gap-4">
							<span class="text-ink">{entry.subject}</span>
							<span class={entry.status === 'sent' ? 'pill-ok' : 'pill-bad'}>{entry.status}</span>
						</div>
						<p class="mt-0.5 text-xs text-muted">{formatDateTime(entry.sentAt)}</p>
						{#if entry.error}
							<p class="mt-1 text-xs text-bad">{entry.error}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
