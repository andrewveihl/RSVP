<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} &middot; Not found</title>
</svelte:head>

<div class="section max-w-lg text-center">
	<p class="eyebrow">{page.status}</p>
	<h1 class="mt-4 font-display text-4xl text-ink">
		{page.status === 404 ? 'This page does not exist' : 'Something went wrong'}
	</h1>
	<p class="mt-4 text-muted">{page.error?.message}</p>

	<a href="/" class="btn-primary mt-8">Back to the beginning</a>

	{#if page.error?.requestId}
		<!-- Surfaced so a guest reporting a problem can quote it and the couple can find
		     the matching line in the container logs. -->
		<p class="mt-8 text-xs text-muted">Reference: {page.error.requestId}</p>
	{/if}
</div>
