<script lang="ts">
	/**
	 * The success / warning / error strip every admin form action returns into.
	 *
	 * One component rather than three inline blocks per page, so the wording, the
	 * colours and -- more importantly -- the `role="alert"` that makes a screen reader
	 * announce the outcome are identical everywhere.
	 */
	let {
		form
	}: {
		form: { success?: string; warning?: string; error?: string } | null | undefined;
	} = $props();
</script>

{#if form?.error}
	<p class="mt-4 rounded-lg border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad" role="alert">
		{form.error}
	</p>
{/if}

{#if form?.success}
	<p class="mt-4 rounded-lg border border-ok/40 bg-ok/10 px-4 py-2.5 text-sm text-ok" role="status">
		{form.success}
	</p>
{/if}

{#if form?.warning}
	<p class="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn" role="status">
		{form.warning}
	</p>
{/if}
