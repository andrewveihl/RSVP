<script lang="ts">
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div>
	<h1 class="font-display text-2xl text-ink">Settings</h1>
	<p class="mt-1 text-sm text-muted">
		These override what is in <code>.env</code>, and take effect immediately -- no restart.
	</p>
</div>

<Flash {form} />

<div class="mt-5 grid gap-4 lg:grid-cols-2">
	<form method="POST" action="?/save" class="card space-y-4 p-5">
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
		<h2 class="text-sm font-semibold text-ink">The wedding</h2>

		<div>
			<label class="label" for="couple_names">Names</label>
			<input id="couple_names" name="couple_names" class="field" value={data.settings.couple_names} />
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<label class="label" for="wedding_date">Wedding date</label>
				<input
					id="wedding_date"
					name="wedding_date"
					type="date"
					class="field"
					value={data.settings.wedding_date}
				/>
				<p class="mt-1 text-xs text-muted">Drives the countdown.</p>
			</div>

			<div>
				<label class="label" for="rsvp_deadline">RSVP deadline</label>
				<input
					id="rsvp_deadline"
					name="rsvp_deadline"
					type="date"
					class="field"
					value={data.settings.rsvp_deadline.slice(0, 10)}
				/>
				<p class="mt-1 text-xs text-muted">
					A soft lock: guests stop being able to reply, but you can still record one for
					them from the RSVPs screen.
				</p>
			</div>
		</div>

		<div>
			<label class="label" for="venue_name">Venue</label>
			<input id="venue_name" name="venue_name" class="field" value={data.settings.venue_name} />
		</div>

		<div>
			<label class="label" for="venue_address">Venue address</label>
			<textarea id="venue_address" name="venue_address" class="field" rows="3"
				>{data.settings.venue_address}</textarea>
		</div>

		<div>
			<label class="label" for="contact_email">Contact email</label>
			<input
				id="contact_email"
				name="contact_email"
				type="email"
				class="field"
				value={data.settings.contact_email}
			/>
			<p class="mt-1 text-xs text-muted">
				Shown to guests who cannot find their invitation, or who miss the deadline.
			</p>
		</div>

		<h2 class="pt-2 text-sm font-semibold text-ink">Email</h2>

		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<label class="label" for="gmail_user">Gmail address</label>
				<input
					id="gmail_user"
					name="gmail_user"
					type="email"
					class="field"
					placeholder="you@gmail.com"
					value={data.settings.gmail_user}
				/>
			</div>
			<div>
				<label class="label" for="gmail_from_name">Sender name</label>
				<input
					id="gmail_from_name"
					name="gmail_from_name"
					class="field"
					value={data.settings.gmail_from_name}
				/>
				<p class="mt-1 text-xs text-muted">
					What guests see the mail is from. The app password goes in the panel opposite.
				</p>
			</div>
		</div>

		<h2 class="pt-2 text-sm font-semibold text-ink">Printing and backups</h2>

		<div class="grid gap-4 sm:grid-cols-3">
			<div>
				<label class="label" for="invitation_width_in">Card width (in)</label>
				<input
					id="invitation_width_in"
					name="invitation_width_in"
					type="number"
					min="1"
					max="20"
					step="0.25"
					class="field"
					value={data.settings.invitation_width_in}
				/>
			</div>
			<div>
				<label class="label" for="invitation_height_in">Card height (in)</label>
				<input
					id="invitation_height_in"
					name="invitation_height_in"
					type="number"
					min="1"
					max="20"
					step="0.25"
					class="field"
					value={data.settings.invitation_height_in}
				/>
			</div>
			<div>
				<label class="label" for="backup_retention_days">Keep backups (days)</label>
				<input
					id="backup_retention_days"
					name="backup_retention_days"
					type="number"
					min="1"
					max="365"
					class="field"
					value={data.settings.backup_retention_days}
				/>
			</div>
		</div>

		<button type="submit" class="btn-primary">Save settings</button>
	</form>

	<div class="space-y-4">
		<section class="card space-y-4 p-5">
			<h2 class="text-sm font-semibold text-ink">Gmail</h2>

			{#if data.passwordUnreadable}
				<p class="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
					A password is stored but cannot be read. That happens when
					<code>ADMIN_PASSWORD</code> changes: the password is encrypted with a key derived
					from it, so the old value is no longer recoverable. Enter the app password again
					below.
				</p>
			{:else if data.mailConfigured}
				<p class="text-sm text-muted">
					Sending as <span class="text-ink">{data.fromName} &lt;{data.smtpUser}&gt;</span>
					via {data.smtpHost}:{data.smtpPort}.
					{#if data.passwordFromEnv}
						<span class="block text-xs">
							The password is coming from <code>.env</code>. Setting one below moves it into
							the app, where it can be changed without a restart.
						</span>
					{/if}
				</p>
			{:else}
				<p class="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
					Not configured yet. Fill in the address above, then the app password below.
					Reminder emails and emailed invitations are unavailable until both are set;
					everything else works regardless.
				</p>
			{/if}

			<form method="POST" action="?/saveGmailPassword" class="space-y-3">
				<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />

				<div>
					<label class="label" for="appPassword">
						App password {data.passwordStored ? '(stored)' : ''}
					</label>
					<input
						id="appPassword"
						name="appPassword"
						type="password"
						class="field font-mono"
						autocomplete="off"
						placeholder={data.passwordStored ? 'Stored — type to replace' : 'abcd efgh ijkl mnop'}
					/>
					<p class="mt-1 text-xs text-muted">
						A Google <strong>app password</strong>, not your account password: create one at
						<code>myaccount.google.com/apppasswords</code> with 2-step verification on.
						Spaces are fine — Google shows it in four groups.
					</p>
					<p class="mt-1 text-xs text-muted">
						Stored encrypted, with a key derived from <code>ADMIN_PASSWORD</code>, so a
						downloaded backup on its own does not reveal it. It is never sent back to this
						page — which is why the field is blank even when one is saved.
					</p>
				</div>

				<div class="flex flex-wrap gap-2">
					<button type="submit" class="btn-primary">Save app password</button>
					{#if data.passwordStored}
						<button
							type="submit"
							class="btn-danger"
							onclick={(event) => {
								const field = document.getElementById('appPassword') as HTMLInputElement | null;
								if (!confirm('Remove the stored Gmail app password?')) event.preventDefault();
								else if (field) field.value = '';
							}}
						>
							Remove
						</button>
					{/if}
				</div>
			</form>

			<form method="POST" action="?/testEmail" class="space-y-3 border-t border-line pt-4">
				<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />

				<div>
					<label class="label" for="to">Send a test to</label>
					<input
						id="to"
						name="to"
						type="email"
						class="field"
						placeholder={data.smtpUser || 'you@example.com'}
					/>
				</div>

				<button type="submit" class="btn-secondary" disabled={!data.mailConfigured}>
					Send test email
				</button>
			</form>
		</section>

		<section class="card p-5 text-sm">
			<h2 class="text-sm font-semibold text-ink">Deployment</h2>
			<dl class="mt-3 space-y-2">
				<div class="flex justify-between gap-4">
					<dt class="text-muted">Guest site</dt>
					<dd class="break-all text-right text-ink">{data.siteUrl}</dd>
				</div>
				<div class="flex justify-between gap-4">
					<dt class="text-muted">Admin</dt>
					<dd class="break-all text-right text-ink">{data.adminUrl}</dd>
				</div>
				<div class="flex justify-between gap-4">
					<dt class="text-muted">Auto-logout</dt>
					<dd class="text-right text-ink">{data.sessionMinutes} minutes idle</dd>
				</div>
			</dl>
			<p class="mt-4 text-xs text-muted">
				These come from <code>PUBLIC_SITE_URL</code>, <code>PUBLIC_ADMIN_URL</code> and
				<code>ADMIN_SESSION_TTL_MS</code>. They are part of the deployment rather than the
				wedding, so they live in <code>.env</code> and need a restart to change.
			</p>
		</section>
	</div>
</div>
