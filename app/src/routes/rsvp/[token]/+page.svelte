<script lang="ts">
	/**
	 * The RSVP form -- the one page that has to work perfectly on a phone.
	 *
	 * Three things shape the layout, all of them measured rather than guessed:
	 *
	 * - The site nav and footer are gone (the root layout drops them for `/rsvp`),
	 *   because they took a third of a Pixel 5 viewport on a page nobody navigates from.
	 * - The submit button is pinned to the bottom, because at 779px on a 727px screen it
	 *   used to sit below the fold: *every* guest had to scroll before they could reply.
	 * - The count is a stepper, so the keyboard never opens over the button.
	 *
	 * It is still a real `<form>` posting to a form action. `use:enhance` only removes
	 * the page reload; with scripts off it submits, validates and confirms exactly the
	 * same way.
	 */
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import { pluralise } from '$shared/format';
	import Stepper from '$lib/components/Stepper.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const existing = $derived(data.household?.rsvp ?? null);
	const words = $derived(data.site.content.wording);

	// Seeded from the household's existing reply and then owned by the form; `untrack`
	// marks that one-time read as deliberate.
	let attending = $state<'yes' | 'no' | ''>(
		untrack(() => (existing ? (existing.attending ? 'yes' : 'no') : ''))
	);
	// A previous *decline* is stored as a total of zero, so it must not seed the
	// stepper -- switching back to "yes" would then submit nobody at all.
	//
	// Clamped to the household's ceiling, which matters when the couple lowered it
	// after a reply came in: without this the stepper would open above its own maximum
	// on a number the server is now going to refuse, with no obvious way down.
	let guestTotal = $state(
		untrack(() => {
			const previous = existing?.attending ? existing.total : 0;
			const seed = previous > 0 ? previous : (data.household?.partySize ?? 1);
			return Math.min(seed, data.maxGuests);
		})
	);
	let submitting = $state(false);
</script>

<svelte:head>
	<title>{words.rsvpHeading} &middot; {data.site.coupleNames}</title>
</svelte:head>

{#if !data.found}
	<!-- Wrong or mistyped link. Offer the way forward rather than an error code. -->
	<div class="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
		<h1 class="font-display text-3xl text-ink">We couldn't find that link</h1>
		<p class="mt-3 max-w-xs text-sm text-muted">
			It may have been mistyped. You can look yourself up by name instead.
		</p>
		<a href="/rsvp" class="btn-primary mt-8">Find my invitation</a>
		{#if data.site.contactEmail}
			<a
				class="mt-4 text-xs text-muted underline-offset-4 hover:underline"
				href="mailto:{data.site.contactEmail}"
			>
				{data.site.contactEmail}
			</a>
		{/if}
	</div>
{:else if form?.success}
	<div
		class="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center"
		data-testid="rsvp-confirmation"
	>
		{#if form.attending}
			<h1 class="font-display text-4xl text-ink">{words.thanksAttendingHeading}</h1>
			<p class="mt-3 text-muted">{words.thanksAttendingBody}</p>

			{#if data.calendarUrl}
				<!-- Offered while the phone is still in their hand, which is the only moment
				     anybody actually adds a date to a calendar. -->
				<a href={data.calendarUrl} class="btn-primary mt-8" download>Add to calendar</a>
			{/if}
		{:else}
			<h1 class="font-display text-4xl text-ink">{words.thanksDecliningHeading}</h1>
			<p class="mt-3 text-muted">{words.thanksDecliningBody}</p>
		{/if}

		<!-- Deliberately quiet. Plans change, and without this they email you instead. -->
		<a
			href="/rsvp/{data.token}"
			data-sveltekit-reload
			class="mt-8 text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
		>
			Change your reply
		</a>
	</div>
{:else if data.closed}
	<div
		class="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center"
		data-testid="rsvp-closed"
	>
		<h1 class="font-display text-3xl text-ink">The deadline has passed</h1>
		<p class="mt-3 max-w-xs text-sm text-muted">
			RSVPs closed on {data.deadlineLabel}. We would still love to hear from you.
		</p>
		{#if data.site.contactEmail}
			<a href="mailto:{data.site.contactEmail}" class="btn-primary mt-8">Get in touch</a>
		{/if}
		{#if existing}
			<p class="mt-8 text-xs text-muted">
				Your reply on file: {existing.attending
					? `attending, ${existing.total} guest${existing.total === 1 ? '' : 's'}`
					: 'not attending'}.
			</p>
		{/if}
	</div>
{:else}
	<!--
		A phone gets a full-height column; a desktop gets a card of readable width,
		centred. Same markup, and the difference is entirely in what `sm:` turns off --
		the growing, the pinning and the edge-to-edge padding are all mobile answers to
		mobile problems.
	-->
	<form
		method="POST"
		class="flex flex-1 flex-col sm:my-10 sm:w-full sm:max-w-md sm:flex-none sm:self-center
			sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:shadow-card"
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
			Honeypot. Hidden from sight and from assistive technology, and never focusable,
			so only something filling every field by name will touch it.
		-->
		<div class="hidden" aria-hidden="true">
			<label for="website">Website</label>
			<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
		</div>

		<div class="flex-1 px-5 pb-4 pt-8 sm:flex-none sm:px-8">
			<header class="text-center">
				<h1 class="font-display text-2xl leading-tight text-ink">{data.household?.name}</h1>
				{#if data.deadlineLabel}
					<p class="mt-1 text-xs text-muted">Please reply by {data.deadlineLabel}</p>
				{/if}
				{#if words.rsvpIntro}
					<p class="mt-2 text-sm text-muted">{words.rsvpIntro}</p>
				{/if}
			</header>

			{#if existing}
				<p class="mt-4 rounded-lg bg-sunken px-3 py-2 text-center text-xs text-muted">
					You replied
					<strong class="text-ink">
						{existing.attending ? `yes, ${existing.total}` : 'no'}
					</strong>. Change it below.
				</p>
			{/if}

			{#if form?.error}
				<p
					class="mt-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-center text-sm text-bad"
					role="alert"
				>
					{form.error}
				</p>
			{/if}

			<fieldset class="mt-6">
				<legend class="sr-only">Will you be joining us?</legend>
				<div class="grid gap-3">
					<label
						class="choice"
						class:choice-on={attending === 'yes'}
						class:choice-off={attending !== 'yes'}
					>
						<input type="radio" name="attending" value="yes" bind:group={attending} class="sr-only" required />
						<span>{words.rsvpAcceptLabel}</span>
					</label>

					<label
						class="choice"
						class:choice-on={attending === 'no'}
						class:choice-off={attending !== 'no'}
					>
						<input type="radio" name="attending" value="no" bind:group={attending} class="sr-only" required />
						<span>{words.rsvpDeclineLabel}</span>
					</label>
				</div>
			</fieldset>

			<!--
				Always in the DOM, only hidden when the answer is "no". Rendering it
				conditionally would break the no-JS path: nothing there re-renders on the
				radio change, so an accepting guest would post a form with no count at all.
			-->
			<div class="mt-7" class:hidden={attending === 'no'}>
				<p id="count-question" class="text-center text-sm text-muted">
					{words.rsvpCountQuestion}
				</p>
				<div class="mt-3">
					<Stepper
						name="guestTotal"
						bind:value={guestTotal}
						min={1}
						max={data.maxGuests}
						label={words.rsvpCountQuestion}
						describedBy="count-question"
					/>
				</div>
				{#if data.capped && guestTotal >= data.maxGuests}
					<!--
						At the ceiling the couple set for this household. Said as a fact with a
						way forward, not as a refusal: the guest has not done anything wrong,
						and a family that genuinely needs another place needs to know who to ask.
					-->
					<p class="mt-3 text-center text-xs text-muted">
						<!-- Worded the same way the server words its refusal, so a guest who
						     manages to post past this is not told something different. -->
						This invitation is for up to {pluralise(data.maxGuests, 'guest')}.
						{#if data.site.contactEmail}
							If that is not right, <a
								class="text-accent underline-offset-4 hover:underline"
								href="mailto:{data.site.contactEmail}">let us know</a
							>.
						{:else}
							Please get in touch if that is not right.
						{/if}
					</p>
				{:else if data.household && guestTotal > data.household.partySize}
					<p class="mt-3 text-center text-xs text-muted">
						That is {guestTotal - data.household.partySize} more than we had you down for --
						no problem, we just wanted to check.
					</p>
				{/if}
			</div>
		</div>

		<!--
			Pinned, so the button is reachable without scrolling on any phone. `sticky`
			rather than `fixed` keeps it in the flow, so it never overlaps the content on a
			short screen or with the keyboard open. On a desktop there is nothing to pin it
			against, so it becomes the last row of the card.
		-->
		<div
			class="sticky bottom-0 border-t border-line/70 bg-canvas/95 px-5 py-3 backdrop-blur
				sm:static sm:border-t-0 sm:bg-transparent sm:px-8 sm:pb-8 sm:pt-0 sm:backdrop-blur-none"
		>
			<button type="submit" class="btn-primary w-full" disabled={submitting}>
				{#if submitting}
					Sending...
				{:else if existing}
					{words.rsvpUpdateLabel}
				{:else}
					{words.rsvpSubmitLabel}
				{/if}
			</button>
		</div>
	</form>
{/if}

<style>
	.choice {
		display: flex;
		min-height: 64px;
		cursor: pointer;
		align-items: center;
		justify-content: center;
		border-radius: 0.75rem;
		border-width: 1px;
		padding: 0 1rem;
		text-align: center;
		transition: border-color 150ms, background-color 150ms;
	}

	.choice-on {
		border-color: rgb(var(--c-accent));
		background: rgb(var(--c-accent-soft));
		color: rgb(var(--c-ink));
	}

	.choice-off {
		border-color: rgb(var(--c-line));
		background: rgb(var(--c-surface));
		color: rgb(var(--c-ink));
	}

	/* The radio is visually hidden, so the focus ring has to move to its label. */
	.choice:focus-within {
		outline: 2px solid rgb(var(--c-accent));
		outline-offset: 2px;
	}
</style>
