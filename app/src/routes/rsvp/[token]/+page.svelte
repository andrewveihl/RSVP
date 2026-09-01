<script lang="ts">
	/**
	 * The RSVP form.
	 *
	 * It is a real `<form>` posting to a form action, enhanced rather than replaced by
	 * JavaScript: with scripts blocked it still submits, still validates on the server
	 * and still shows the confirmation. `use:enhance` only removes the full page
	 * reload.
	 */
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const existing = $derived(data.household?.rsvp ?? null);

	// Pre-filled from the existing reply so "update my RSVP" starts from what they said
	// last time, not from a blank form. `untrack` marks that one-time read as
	// deliberate: from here on the form owns these values.
	let attending = $state<'yes' | 'no' | ''>(
		untrack(() => (existing ? (existing.attending ? 'yes' : 'no') : ''))
	);
	let guestCount = $state(untrack(() => existing?.guestCount ?? data.household?.partySize ?? 1));
	let plusOneCount = $state(untrack(() => existing?.plusOneCount ?? 0));
	let submitting = $state(false);

	const total = $derived(Number(guestCount || 0) + Number(plusOneCount || 0));
</script>

<svelte:head>
	<title>RSVP &middot; {data.site.coupleNames}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="section max-w-xl">
	{#if !data.found}
		<!-- Wrong or expired link. Offer the way forward rather than an error code. -->
		<div class="text-center">
			<p class="eyebrow">Hmm</p>
			<h1 class="mt-4 font-display text-4xl text-ink">We couldn't find that link</h1>
			<p class="mt-4 text-muted">
				The link may have been mistyped. You can look yourself up by name instead.
			</p>
			<a href="/rsvp" class="btn-primary mt-8">Find my invitation</a>
			{#if data.site.contactEmail}
				<p class="mt-6 text-sm text-muted">
					Or email us at
					<a class="text-accent underline-offset-4 hover:underline" href="mailto:{data.site.contactEmail}">
						{data.site.contactEmail}
					</a>
				</p>
			{/if}
		</div>
	{:else if form?.success}
		<div class="text-center" data-testid="rsvp-confirmation">
			<p class="eyebrow">{form.updated ? 'Updated' : 'Received'}</p>
			{#if form.attending}
				<h1 class="mt-4 font-display text-4xl text-ink">Thank you!</h1>
				<p class="mt-4 text-muted">We can't wait to celebrate with you.</p>
			{:else}
				<h1 class="mt-4 font-display text-4xl text-ink">We'll miss you!</h1>
				<p class="mt-4 text-muted">Thank you for letting us know.</p>
			{/if}
			<a href="/" class="btn-secondary mt-8">Back to the site</a>
		</div>
	{:else if data.closed}
		<div class="text-center" data-testid="rsvp-closed">
			<p class="eyebrow">RSVP</p>
			<h1 class="mt-4 font-display text-4xl text-ink">The deadline has passed</h1>
			<p class="mt-4 text-muted">
				RSVPs closed on {data.deadlineLabel}. We would still love to hear from you --
				please get in touch and we'll add you by hand.
			</p>
			{#if data.site.contactEmail}
				<a href="mailto:{data.site.contactEmail}" class="btn-primary mt-8">
					Email {data.site.coupleNames}
				</a>
			{/if}
			{#if existing}
				<p class="mt-8 text-sm text-muted">
					Your reply on file: {existing.attending
						? `attending, ${existing.guestCount + existing.plusOneCount} guest(s)`
						: 'not attending'}.
				</p>
			{/if}
		</div>
	{:else}
		<header class="text-center">
			<p class="eyebrow">{data.site.coupleNames}</p>
			<h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">RSVP</h1>
			<p class="mt-5 text-lg text-ink">{data.household?.name}</p>
			{#if data.deadlineLabel}
				<p class="mt-2 text-sm text-muted">Please reply by {data.deadlineLabel}</p>
			{/if}
		</header>

		{#if existing}
			<p class="mt-8 rounded-xl border border-line bg-sunken/60 px-4 py-3 text-center text-sm text-muted">
				You already replied
				<strong class="text-ink">
					{existing.attending
						? `yes, ${existing.guestCount + existing.plusOneCount} guest(s)`
						: 'no'}
				</strong>. You can change it below until the deadline.
			</p>
		{/if}

		{#if form?.error}
			<p class="mt-6 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-center text-sm text-bad" role="alert">
				{form.error}
			</p>
		{/if}

		<form
			method="POST"
			class="mt-10 space-y-8"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
				};
			}}
		>
			<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />

			<!--
				Honeypot. Hidden from sight and from assistive technology, and never
				focusable, so only something filling every field by name will touch it.
			-->
			<div class="hidden" aria-hidden="true">
				<label for="website">Website</label>
				<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
			</div>

			<fieldset>
				<legend class="label text-center">Will you be joining us?</legend>
				<div class="mt-3 grid gap-3 sm:grid-cols-2">
					<label
						class="flex min-h-[64px] cursor-pointer items-center justify-center gap-3 rounded-xl border px-4 text-center transition-colors"
						class:border-accent={attending === 'yes'}
						class:bg-accent-soft={attending === 'yes'}
						class:border-line={attending !== 'yes'}
					>
						<input
							type="radio"
							name="attending"
							value="yes"
							bind:group={attending}
							class="accent-accent"
							required
						/>
						<span class="text-ink">Joyfully accepts</span>
					</label>

					<label
						class="flex min-h-[64px] cursor-pointer items-center justify-center gap-3 rounded-xl border px-4 text-center transition-colors"
						class:border-accent={attending === 'no'}
						class:bg-accent-soft={attending === 'no'}
						class:border-line={attending !== 'no'}
					>
						<input
							type="radio"
							name="attending"
							value="no"
							bind:group={attending}
							class="accent-accent"
							required
						/>
						<span class="text-ink">Regretfully declines</span>
					</label>
				</div>
			</fieldset>

			<!--
				The counts are always in the DOM, only hidden when the answer is "no".
				Rendering them conditionally would break the no-JS path: nothing there
				re-renders on the radio change, so an accepting guest would post a form
				with no guest count at all. They are deliberately not `required` for the
				same reason -- a hidden required field blocks submission outright -- so the
				server's own validation is what enforces them.
			-->
			<div class:hidden={attending === 'no'} class="space-y-5">
				<div class="grid gap-5 sm:grid-cols-2">
					<div>
						<label class="label" for="guestCount">Guests from your household</label>
						<input
							id="guestCount"
							name="guestCount"
							type="number"
							inputmode="numeric"
							min="1"
							max={data.maxGuests}
							step="1"
							class="field"
							bind:value={guestCount}
						/>
					</div>
					<div>
						<label class="label" for="plusOneCount">Additional guests</label>
						<input
							id="plusOneCount"
							name="plusOneCount"
							type="number"
							inputmode="numeric"
							min="0"
							max={data.maxGuests}
							step="1"
							class="field"
							bind:value={plusOneCount}
						/>
					</div>
				</div>

				<p class="text-center text-sm text-muted" aria-live="polite">
					{total} {total === 1 ? 'person' : 'people'} in total.
				</p>
			</div>

			{#if attending === 'no'}
				<p class="text-center text-muted">We'll miss you -- thank you for telling us.</p>
			{/if}

			<div class="text-center">
				<button type="submit" class="btn-primary w-full sm:w-auto" disabled={submitting}>
					{#if submitting}
						Sending...
					{:else if existing}
						Update our reply
					{:else}
						Send our reply
					{/if}
				</button>
			</div>
		</form>
	{/if}
</div>
