<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="mx-auto mt-16 max-w-sm">
	<header class="text-center">
		<h1 class="font-display text-3xl text-ink">Wedding admin</h1>
		<p class="mt-2 text-sm text-muted">Sign in to manage the guest list.</p>
	</header>

	{#if !data.configured}
		<p class="mt-6 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
			<code>ADMIN_PASSWORD</code> is not set on the server, so nobody can sign in. Set it in
			<code>.env</code> and restart the container.
		</p>
	{/if}

	{#if form?.error}
		<p
			class="mt-6 rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad"
			role="alert"
			data-testid="login-error"
		>
			{form.error}
		</p>
	{/if}

	<form method="POST" action="?/login" class="card mt-6 space-y-4 p-6">
		<input type="hidden" name="redirectTo" value={data.redirectTo} />

		<div>
			<label class="label" for="password">Password</label>
			<!--
				Autofocus is normally a nuisance -- it steals the caret from whatever the
				visitor was doing. On a single-field sign-in page that field *is* the page,
				so focusing it is what anybody arriving here was about to do anyway.
			-->
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="password"
				name="password"
				type="password"
				class="field"
				autocomplete="current-password"
				required
				autofocus
			/>
		</div>

		<button type="submit" class="btn-primary w-full">Sign in</button>
	</form>

	<p class="mt-6 text-center text-xs text-muted">
		<a class="hover:text-ink" href={data.siteUrl} target="_blank" rel="noopener noreferrer">
			View the guest site &rarr;
		</a>
	</p>
</div>
