<script lang="ts">
	/**
	 * Daily RSVP activity.
	 *
	 * One series, so one hue and no legend. Each bar is its own hit target with its own
	 * tooltip -- there is no crosshair, because on a bar chart the mark itself is what
	 * the pointer aims at.
	 */
	import { formatShortDate } from '$shared/format';

	let {
		bars,
		height = 160
	}: { bars: { date: string; responses: number }[]; height?: number } = $props();

	const W = 720;
	const PAD = { top: 12, right: 8, bottom: 22, left: 32 };

	const H = $derived(height);
	const plotW = W - PAD.left - PAD.right;
	const plotH = $derived(H - PAD.top - PAD.bottom);

	const maxValue = $derived(Math.max(1, ...bars.map((bar) => bar.responses)));
	const slot = $derived(bars.length === 0 ? plotW : plotW / bars.length);
	// Capped at 24 units, and the band's leftover is left as air rather than filled.
	const barWidth = $derived(Math.min(24, Math.max(2, slot - 3)));

	let hovered = $state<number | null>(null);

	const busiest = $derived.by(() => {
		let best = -1;
		bars.forEach((bar, index) => {
			if (bar.responses > (bars[best]?.responses ?? 0)) best = index;
		});
		return bars[best]?.responses ? best : -1;
	});
</script>

<div class="viz relative">
	{#if bars.length === 0}
		<p class="py-10 text-center text-sm text-muted">Nothing to show yet.</p>
	{:else}
		<svg viewBox="0 0 {W} {H}" class="w-full" style="height: {H}px" role="img"
			aria-label="Daily responses over the last {bars.length} days">
			<line
				x1={PAD.left}
				x2={W - PAD.right}
				y1={PAD.top + plotH}
				y2={PAD.top + plotH}
				stroke="var(--viz-grid)"
				stroke-width="1"
			/>
			<text
				x={PAD.left - 8}
				y={PAD.top + 10}
				text-anchor="end"
				class="fill-[rgb(var(--c-muted))] text-[11px]"
			>
				{maxValue}
			</text>

			{#each bars as bar, index (bar.date)}
				{@const barHeight = (bar.responses / maxValue) * plotH}
				{@const x = PAD.left + index * slot + (slot - barWidth) / 2}
				<g
					role="presentation"
					onpointerenter={() => (hovered = index)}
					onpointerleave={() => (hovered = null)}
				>
					<!-- A transparent full-height rect, so the hit target is the column and
					     not the two-pixel bar inside it. -->
					<rect
						x={PAD.left + index * slot}
						y={PAD.top}
						width={slot}
						height={plotH}
						fill="transparent"
					/>
					{#if bar.responses > 0}
						<rect
							{x}
							y={PAD.top + plotH - barHeight}
							width={barWidth}
							height={barHeight}
							rx="2"
							fill="var(--viz-1)"
							fill-opacity={hovered === null || hovered === index ? 1 : 0.55}
						/>
					{/if}
				</g>
			{/each}

			{#if busiest >= 0}
				<!-- Only the busiest day is labelled directly; the rest live in the tooltip. -->
				<text
					x={PAD.left + busiest * slot + slot / 2}
					y={PAD.top + plotH - (bars[busiest].responses / maxValue) * plotH - 6}
					text-anchor="middle"
					class="fill-[rgb(var(--c-ink))] text-[11px] font-semibold"
				>
					{bars[busiest].responses}
				</text>
			{/if}

			<text x={PAD.left} y={H - 6} class="fill-[rgb(var(--c-muted))] text-[11px]">
				{formatShortDate(bars[0].date)}
			</text>
			<text
				x={W - PAD.right}
				y={H - 6}
				text-anchor="end"
				class="fill-[rgb(var(--c-muted))] text-[11px]"
			>
				{formatShortDate(bars.at(-1)?.date)}
			</text>
		</svg>

		{#if hovered !== null && bars[hovered]}
			<div
				class="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs shadow-lift"
				role="status"
			>
				<span class="font-semibold text-ink">{bars[hovered].responses}</span>
				<span class="text-muted">
					{bars[hovered].responses === 1 ? 'reply' : 'replies'} on {formatShortDate(bars[hovered].date)}
				</span>
			</div>
		{/if}
	{/if}
</div>
