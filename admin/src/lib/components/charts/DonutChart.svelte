<script lang="ts">
	/**
	 * Status breakdown as a donut.
	 *
	 * A donut is only defensible for part-to-whole at a glance with a handful of
	 * segments, which is exactly this: three states that always sum to the guest list.
	 * It is paired with a legend carrying the real numbers, so nothing here depends on
	 * comparing arc lengths by eye -- and the aqua slot sits below 3:1 on the light
	 * surface, which obliges those visible labels rather than making them optional.
	 */
	let {
		segments,
		size = 190
	}: {
		segments: { label: string; value: number; color: string }[];
		size?: number;
	} = $props();

	const total = $derived(segments.reduce((sum, segment) => sum + segment.value, 0));

	const RADIUS = 60;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	/** The 2px surface gap that separates touching segments, in path units. */
	const GAP = 2;

	let hovered = $state<number | null>(null);

	/**
	 * Segments are drawn as dash-array arcs on one circle rather than as pie wedges:
	 * the stroke gives the ring its thickness for free, and `stroke-dashoffset`
	 * positions each arc without any trigonometry to get wrong.
	 */
	const arcs = $derived.by(() => {
		if (total === 0) return [];
		let offset = 0;

		return segments
			.filter((segment) => segment.value > 0)
			.map((segment, index) => {
				const length = (segment.value / total) * CIRCUMFERENCE;
				const arc = {
					...segment,
					index,
					// Shorten by the gap so neighbours never touch; never below zero, or a
					// one-guest slice would invert into a full ring.
					dash: Math.max(0, length - GAP),
					offset: -offset,
					percent: Math.round((segment.value / total) * 100)
				};
				offset += length;
				return arc;
			});
	});
</script>

<div class="viz flex flex-wrap items-center justify-center gap-8">
	<div class="relative shrink-0" style="width: {size}px; height: {size}px">
		<svg viewBox="0 0 160 160" class="h-full w-full -rotate-90" role="presentation">
			<!-- The empty track, so an empty guest list still draws a ring. -->
			<circle
				cx="80"
				cy="80"
				r={RADIUS}
				fill="none"
				stroke="rgb(var(--c-sunken))"
				stroke-width="22"
			/>

			{#each arcs as arc (arc.label)}
				<circle
					cx="80"
					cy="80"
					r={RADIUS}
					fill="none"
					stroke={arc.color}
					stroke-width={hovered === arc.index ? 26 : 22}
					stroke-dasharray="{arc.dash} {CIRCUMFERENCE}"
					stroke-dashoffset={arc.offset}
					class="cursor-default transition-[stroke-width] duration-150"
					role="presentation"
					onpointerenter={() => (hovered = arc.index)}
					onpointerleave={() => (hovered = null)}
				/>
			{/each}
		</svg>

		<!-- The hero number sits in the hole, where a donut's centre is otherwise wasted. -->
		<div class="absolute inset-0 flex flex-col items-center justify-center">
			<span class="text-2xl font-semibold tabular-nums text-ink">{total.toLocaleString()}</span>
			<span class="text-[11px] uppercase tracking-wide text-muted">households</span>
		</div>
	</div>

	<!--
		The legend carries the counts, so identity and value are both readable without
		hovering and without matching colours by eye.
	-->
	<ul class="min-w-[11rem] space-y-2.5">
		{#each segments as segment, index (segment.label)}
			<li
				class="flex items-center gap-2.5 text-sm"
				onpointerenter={() => (hovered = index)}
				onpointerleave={() => (hovered = null)}
			>
				<span
					class="h-2.5 w-2.5 shrink-0 rounded-sm"
					style="background: {segment.color}"
					aria-hidden="true"
				></span>
				<span class="text-muted">{segment.label}</span>
				<span class="ml-auto font-semibold tabular-nums text-ink">
					{segment.value.toLocaleString()}
				</span>
				<span class="w-10 text-right text-xs tabular-nums text-muted">
					{total === 0 ? 0 : Math.round((segment.value / total) * 100)}%
				</span>
			</li>
		{/each}
	</ul>
</div>
