<script lang="ts">
	/**
	 * Backups: take one, download one, put one back.
	 *
	 * Restore is the only destructive action in the admin panel that cannot be undone by
	 * doing the opposite, so it is the only one behind a typed word. It is also revealed
	 * per row rather than sitting open, because the row is what says *which* snapshot is
	 * about to replace everything.
	 */
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import { formatBytes, formatDateTime, formatRelative } from '$shared/format';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/** The filename whose restore panel is open, or null. One at a time, deliberately. */
	let restoring = $state<string | null>(null);

	const newest = $derived(data.backups[0] ?? null);
</script>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="font-display text-2xl text-ink">Backups</h1>
		<p class="mt-1 text-sm text-muted">
			A snapshot is taken automatically every day and kept for {data.retentionDays} days. Each
			one is a complete, self-contained copy of the database.
		</p>
	</div>

	<form method="POST" action="?/create">
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
		<button type="submit" class="btn-primary">Back up now</button>
	</form>
</div>

<Flash {form} />

<div class="mt-5 grid gap-4 lg:grid-cols-[1fr_18rem]">
	<section class="card overflow-hidden">
		{#if data.backups.length === 0}
			<p class="px-4 py-12 text-center text-sm text-muted">
				No backups yet. One is written automatically each day -- or take the first now.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="border-b border-line bg-sunken">
						<tr>
							<th class="table-head">Taken</th>
							<th class="table-head">Size</th>
							<th class="table-head text-right">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each data.backups as backup (backup.filename)}
							<tr>
								<td class="table-cell">
									<span class="block text-ink">{formatDateTime(backup.createdAt)}</span>
									<span class="block text-xs text-muted">
										{formatRelative(backup.createdAt)} &middot;
										<span class="font-mono">{backup.filename}</span>
									</span>
								</td>
								<td class="table-cell whitespace-nowrap tabular-nums text-muted">
									{formatBytes(backup.sizeBytes)}
								</td>
								<td class="table-cell">
									<div class="flex flex-wrap justify-end gap-2">
										<!--
											A link rather than a form post: a download is a GET, and it
											keeps working with JavaScript off.
										-->
										<a
											class="btn-secondary btn-sm"
											href="/backups/download?file={encodeURIComponent(backup.filename)}"
											download
										>
											Download
										</a>

										<button
											type="button"
											class="btn-ghost btn-sm"
											onclick={() =>
												(restoring = restoring === backup.filename ? null : backup.filename)}
											aria-expanded={restoring === backup.filename}
										>
											Restore
										</button>

										<form method="POST" action="?/delete">
											<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
											<input type="hidden" name="filename" value={backup.filename} />
											<button type="submit" class="btn-ghost btn-sm text-bad">Delete</button>
										</form>
									</div>
								</td>
							</tr>

							{#if restoring === backup.filename}
								<tr>
									<td colspan="3" class="bg-sunken px-3 py-4">
										<form method="POST" action="?/restore" class="space-y-3">
											<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
											<input type="hidden" name="filename" value={backup.filename} />

											<p class="text-sm text-ink">
												This replaces the guest list, every RSVP and all site content with
												the copy taken
												<strong>{formatDateTime(backup.createdAt)}</strong>. Anything
												recorded since then is lost.
											</p>
											<p class="text-xs text-muted">
												A snapshot of the current data is saved alongside the backups first,
												so restoring the wrong night is itself recoverable.
											</p>

											<div class="sm:max-w-xs">
												<label class="label" for="confirm-{backup.filename}">
													Type RESTORE to confirm
												</label>
												<input
													id="confirm-{backup.filename}"
													name="confirm"
													class="field font-mono"
													autocomplete="off"
													placeholder="RESTORE"
												/>
											</div>

											<div class="flex flex-wrap gap-2">
												<button type="submit" class="btn-danger">Restore this backup</button>
												<button
													type="button"
													class="btn-ghost"
													onclick={() => (restoring = null)}
												>
													Cancel
												</button>
											</div>
										</form>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<aside class="space-y-4">
		<div class="card p-5">
			<h2 class="text-sm font-semibold text-ink">Where they live</h2>
			<p class="mt-2 break-all font-mono text-xs text-muted">{data.directory}</p>
			<p class="mt-3 text-xs text-muted">
				A mounted volume, so the snapshots survive the container being rebuilt. They do not
				survive the machine, which is what the download button is for -- keep the most recent
				one somewhere else.
			</p>
		</div>

		<div class="card p-5">
			<h2 class="text-sm font-semibold text-ink">Most recent</h2>
			{#if newest}
				<p class="mt-2 text-sm text-ink">{formatRelative(newest.createdAt)}</p>
				<p class="mt-1 text-xs text-muted">
					{formatDateTime(newest.createdAt)} &middot; {formatBytes(newest.sizeBytes)}
				</p>
			{:else}
				<p class="mt-2 text-sm text-muted">Nothing yet.</p>
			{/if}
			<p class="mt-3 text-xs text-muted">
				{data.backups.length} kept, pruned after {data.retentionDays} days. The retention
				window is on the <a class="text-accent hover:underline" href="/settings">Settings</a>
				screen.
			</p>
		</div>
	</aside>
</div>
