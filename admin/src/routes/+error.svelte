<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="mx-auto mt-16 max-w-md text-center">
	<p class="text-xs uppercase tracking-wide text-muted">{page.status}</p>
	<h1 class="mt-2 font-display text-2xl text-ink">
		{page.status === 404 ? 'No such page' : 'Something went wrong'}
	</h1>
	<p class="mt-3 text-sm text-muted">{page.error?.message}</p>

	<a href="/dashboard" class="btn-primary mt-6">Back to the dashboard</a>

	{#if page.error?.requestId}
		<p class="mt-6 text-xs text-muted">Reference: {page.error.requestId}</p>
	{/if}
</div>
