<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Seeded from a previous failed lookup so the box is not cleared under the guest;
	// after that it is theirs to type in, which is why the read is untracked.
	let name = $state(untrack(() => form?.query ?? ''));
	let suggestions = $state<string[]>([]);
	let submitting = $state(false);
	let formEl = $state<HTMLFormElement | null>(null);

	/**
	 * Type-ahead, debounced.
	 *
	 * Without the delay every keystroke is a request, which both wastes the endpoint's
	 * rate-limit budget and makes suggestions flicker as slower responses land out of
	 * order. The abort controller handles the ordering; the timer handles the volume.
	 */
	$effect(() => {
		const query = name.trim();
		if (query.length < 2) {
			suggestions = [];
			return;
		}

		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/rsvp/search?q=${encodeURIComponent(query)}`, {
					signal: controller.signal
				});
				if (!response.ok) return;
				const payload = (await response.json()) as { matches: string[] };
				suggestions = payload.matches;
			} catch {
				// An aborted or failed lookup just means no suggestions; the form still works.
			}
		}, 220);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	async function choose(match: string) {
		name = match;
		suggestions = [];

		// `await tick()` is load-bearing: assigning to `name` does not update the input
		// until Svelte flushes, so submitting immediately would post whatever fragment
		// the guest had typed -- and land them back on this same disambiguation list.
		await tick();
		formEl?.requestSubmit();
	}
</script>

<svelte:head>
	<title>RSVP &middot; {data.site.coupleNames}</title>
</svelte:head>

<form
	method="POST"
	bind:this={formEl}
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

	<div class="flex-1 px-5 pb-4 pt-10 sm:flex-none sm:px-8">
		<header class="text-center">
			<h1 class="font-display text-2xl text-ink">Find your invitation</h1>
			<p class="mt-2 text-sm text-muted">Type the name on your invitation.</p>
		</header>

		{#if form?.error}
			<p
				class="mt-6 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-center text-sm text-bad"
				role="alert"
			>
				{form.error}
				{#if form.notFound && data.site.contactEmail}
					<br />
					<a class="underline" href="mailto:{data.site.contactEmail}">{data.site.contactEmail}</a>
				{/if}
			</p>
		{/if}

		<div class="mt-6">
			<label class="sr-only" for="name">Name on the invitation</label>
			<input
				id="name"
				name="name"
				type="text"
				class="field text-center"
				autocomplete="off"
				autocapitalize="words"
				placeholder="e.g. The Whitfield Family"
				bind:value={name}
				required
				minlength="2"
			/>
		</div>

		{#if suggestions.length > 0}
			<ul class="mt-2 overflow-hidden rounded-xl border border-line bg-surface">
				{#each suggestions as match (match)}
					<li>
						<button
							type="button"
							class="block min-h-[48px] w-full px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-sunken"
							onclick={() => choose(match)}
						>
							{match}
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if form?.matches && form.matches.length > 0}
			<!-- Several households share this name fragment. Names only -- picking one posts
			     back through the same action, which is what resolves it to a token. -->
			<section class="mt-8">
				<p class="text-center text-xs text-muted">
					More than one match for "{form.query}". Which one is you?
				</p>
				<ul class="mt-3 space-y-2">
					{#each form.matches as match (match.name)}
						<li>
							<button
								type="button"
								class="card min-h-[52px] w-full px-4 py-3 text-left text-ink transition-colors hover:border-accent"
								onclick={() => choose(match.name)}
							>
								{match.name}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>

	<div
		class="sticky bottom-0 border-t border-line/70 bg-canvas/95 px-5 py-3 backdrop-blur
			sm:static sm:border-t-0 sm:bg-transparent sm:px-8 sm:pb-8 sm:pt-0 sm:backdrop-blur-none"
	>
		<button type="submit" class="btn-primary w-full" disabled={submitting}>
			{submitting ? 'Looking...' : 'Find my invitation'}
		</button>
	</div>
</form>
