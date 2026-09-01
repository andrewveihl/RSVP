<script lang="ts">
	let {
		coupleNames,
		weddingDateLabel,
		contactEmail,
		note = 'Questions?'
	}: {
		coupleNames: string;
		weddingDateLabel: string;
		contactEmail: string;
		note?: string;
	} = $props();
</script>

<footer class="mt-auto border-t border-line/70 px-5 py-10 text-center">
	<p class="font-display text-lg text-ink">{coupleNames}</p>
	{#if weddingDateLabel}
		<p class="mt-1 text-sm text-muted">{weddingDateLabel}</p>
	{/if}
	{#if contactEmail}
		<p class="mt-4 text-sm text-muted">
			{note}
			<a class="text-accent underline-offset-4 hover:underline" href="mailto:{contactEmail}">
				{contactEmail}
			</a>
		</p>
	{/if}
</footer>
