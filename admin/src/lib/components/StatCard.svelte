<script lang="ts">
	/**
	 * One headline number.
	 *
	 * A single value is a stat tile, never a one-bar chart -- the number *is* the
	 * chart. `hint` carries the secondary reading (a percentage, a head count) so the
	 * tile answers the follow-up question without a second card.
	 */
	let {
		label,
		value,
		hint = '',
		tone = 'default'
	}: {
		label: string;
		value: string | number;
		hint?: string;
		tone?: 'default' | 'ok' | 'bad' | 'muted';
	} = $props();

	const toneClass = $derived({
		default: 'text-ink',
		ok: 'text-ok',
		bad: 'text-bad',
		muted: 'text-muted'
	}[tone]);
</script>

<div class="card p-4">
	<p class="text-xs uppercase tracking-wide text-muted">{label}</p>
	<p class="mt-1.5 text-2xl font-semibold tabular-nums {toneClass}">
		{typeof value === 'number' ? value.toLocaleString() : value}
	</p>
	{#if hint}
		<p class="mt-0.5 text-xs text-muted">{hint}</p>
	{/if}
</div>
