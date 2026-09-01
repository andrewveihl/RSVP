<script lang="ts">
	/**
	 * Cumulative responses over time: one series, so an area with a 2px line on top and
	 * no legend -- the card's title already names what is plotted.
	 *
	 * Everything is inline SVG. A charting library would be the only third-party
	 * JavaScript in either app, and the CSP forbids third-party origins anyway, so the
	 * choice is really between vendoring a library and drawing four polylines. The
	 * chart is also plain enough that it renders server-side and is readable before
	 * hydration.
	 */
	import { formatShortDate } from '$shared/format';

	let {
		points,
		height = 220,
		label = 'Cumulative RSVPs'
	}: {
		points: { date: string; cumulative: number }[];
		height?: number;
		label?: string;
	} = $props();

	// A fixed viewBox with `preserveAspectRatio="none"` would stretch the stroke; the
	// chart instead uses a wide viewBox and scales uniformly, which keeps the 2px line
	// at 2px on every screen.
	const W = 720;
	const PAD = { top: 16, right: 56, bottom: 28, left: 44 };

	const H = $derived(height);
	const plotW = W - PAD.left - PAD.right;
	const plotH = $derived(H - PAD.top - PAD.bottom);

	const maxValue = $derived(Math.max(1, ...points.map((point) => point.cumulative)));

	/** Round the axis top up to a clean number so the ticks read 0 / 25 / 50. */
	const axisMax = $derived.by(() => {
		const raw = maxValue;
		const magnitude = 10 ** Math.floor(Math.log10(raw));
		const step = raw / magnitude <= 2 ? magnitude / 2 : magnitude;
		return Math.max(1, Math.ceil(raw / step) * step);
	});

	const ticks = $derived([0, 0.5, 1].map((fraction) => Math.round(axisMax * fraction)));

	const x = (index: number) =>
		PAD.left + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
	const y = (value: number) => PAD.top + plotH - (value / axisMax) * plotH;

	const linePath = $derived(
		points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(point.cumulative)}`).join(' ')
	);

	const areaPath = $derived(
		points.length === 0
			? ''
			: `${linePath} L${x(points.length - 1)} ${PAD.top + plotH} L${x(0)} ${PAD.top + plotH} Z`
	);

	const last = $derived(points.at(-1) ?? null);

	// --- Hover ---------------------------------------------------------------
	let hovered = $state<number | null>(null);
	let svg = $state<SVGSVGElement | null>(null);

	/** Snap to the nearest point, so the reader aims at a date rather than a 2px line. */
	function onMove(event: PointerEvent) {
		if (!svg || points.length === 0) return;
		const box = svg.getBoundingClientRect();
		const ratio = ((event.clientX - box.left) / box.width) * W;
		const index = Math.round(((ratio - PAD.left) / plotW) * (points.length - 1));
		hovered = Math.min(points.length - 1, Math.max(0, index));
	}
</script>

<div class="viz relative">
	{#if points.length === 0}
		<p class="py-12 text-center text-sm text-muted">No responses yet.</p>
	{:else}
		<svg
			bind:this={svg}
			viewBox="0 0 {W} {H}"
			class="w-full"
			style="height: {H}px"
			role="img"
			aria-label="{label}: {last?.cumulative ?? 0} by {formatShortDate(last?.date)}"
			onpointermove={onMove}
			onpointerleave={() => (hovered = null)}
		>
			<!-- Gridlines: hairline, solid, one step off the surface. -->
			{#each ticks as tick (tick)}
				<line
					x1={PAD.left}
					x2={W - PAD.right}
					y1={y(tick)}
					y2={y(tick)}
					stroke="var(--viz-grid)"
					stroke-width="1"
				/>
				<text
					x={PAD.left - 8}
					y={y(tick) + 4}
					text-anchor="end"
					class="fill-[rgb(var(--c-muted))] text-[11px]"
				>
					{tick.toLocaleString()}
				</text>
			{/each}

			<path d={areaPath} fill="var(--viz-1)" fill-opacity="0.1" />
			<path
				d={linePath}
				fill="none"
				stroke="var(--viz-1)"
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>

			<!-- Only the endpoint is directly labelled; a number on every point is noise. -->
			{#if last}
				<circle
					cx={x(points.length - 1)}
					cy={y(last.cumulative)}
					r="4"
					fill="var(--viz-1)"
					stroke="var(--viz-surface)"
					stroke-width="2"
				/>
				<text
					x={x(points.length - 1) + 10}
					y={y(last.cumulative) + 4}
					class="fill-[rgb(var(--c-ink))] text-[12px] font-semibold"
				>
					{last.cumulative.toLocaleString()}
				</text>
			{/if}

			<!-- First and last dates only: enough to orient, no tick collisions. -->
			<text x={PAD.left} y={H - 8} class="fill-[rgb(var(--c-muted))] text-[11px]">
				{formatShortDate(points[0].date)}
			</text>
			{#if points.length > 1}
				<text
					x={W - PAD.right}
					y={H - 8}
					text-anchor="end"
					class="fill-[rgb(var(--c-muted))] text-[11px]"
				>
					{formatShortDate(last?.date)}
				</text>
			{/if}

			{#if hovered !== null && points[hovered]}
				<line
					x1={x(hovered)}
					x2={x(hovered)}
					y1={PAD.top}
					y2={PAD.top + plotH}
					stroke="var(--viz-grid)"
					stroke-width="1"
				/>
				<circle
					cx={x(hovered)}
					cy={y(points[hovered].cumulative)}
					r="4.5"
					fill="var(--viz-1)"
					stroke="var(--viz-surface)"
					stroke-width="2"
				/>
			{/if}
		</svg>

		{#if hovered !== null && points[hovered]}
			<!-- Value leads, label follows: here the reader has the series and wants the number. -->
			<div
				class="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs shadow-lift"
				role="status"
			>
				<span class="font-semibold text-ink">{points[hovered].cumulative.toLocaleString()}</span>
				<span class="text-muted"> replies by {formatShortDate(points[hovered].date)}</span>
			</div>
		{/if}
	{/if}
</div>
