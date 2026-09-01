<script lang="ts">
	/**
	 * The countdown to the wedding, as a split-flap clock.
	 *
	 * It renders on the server too, so a visitor with JavaScript disabled sees the real
	 * remaining time as of page load rather than an empty box -- it simply stops
	 * ticking. That is the graceful degradation the brief asks for, and it is why the
	 * initial value is computed from props instead of in `onMount`.
	 *
	 * Once the date passes, the clock is replaced by the celebration line rather than
	 * counting up from zero.
	 */
	import { untrack } from 'svelte';
	import { countdownTo, pad2 } from '$shared/format';
	import FlipDigit from './FlipDigit.svelte';

	let {
		target,
		coupleNames,
		/** Injected by tests so "after the wedding" is reachable without time travel. */
		now = undefined
	}: { target: string; coupleNames: string; now?: number } = $props();

	const targetDate = $derived(new Date(target));
	const valid = $derived(!Number.isNaN(targetDate.getTime()));

	// Seeded once, then driven by the interval below -- so `untrack`, which says the
	// one-time read is deliberate rather than a missed dependency.
	let remaining = $state(untrack(() => countdownTo(new Date(target), now ?? Date.now())));

	$effect(() => {
		if (!valid || remaining.past) return;

		// Ticking on a one-second interval drifts against the wall clock; recomputing
		// the whole delta each tick means a tab that was backgrounded for an hour comes
		// back correct rather than an hour behind.
		const timer = setInterval(() => {
			remaining = countdownTo(targetDate, Date.now());
		}, 1000);

		return () => clearInterval(timer);
	});

	// Days are not padded to a fixed width: 512 days should not read "0512".
	const units = $derived([
		{ label: remaining.days === 1 ? 'Day' : 'Days', value: String(remaining.days) },
		{ label: remaining.hours === 1 ? 'Hour' : 'Hours', value: pad2(remaining.hours) },
		{ label: remaining.minutes === 1 ? 'Minute' : 'Minutes', value: pad2(remaining.minutes) },
		{ label: remaining.seconds === 1 ? 'Second' : 'Seconds', value: pad2(remaining.seconds) }
	]);

	const spoken = $derived(
		`${remaining.days} days, ${remaining.hours} hours and ${remaining.minutes} minutes until the wedding`
	);
</script>

{#if !valid}
	<!-- No usable date configured: say nothing rather than render NaN. -->
{:else if remaining.past}
	<div class="text-center" data-testid="countdown-past">
		<p class="eyebrow">And just like that</p>
		<p class="mt-3 font-display text-4xl text-ink sm:text-5xl">We're married!</p>
		<p class="mt-3 text-muted">Thank you to everyone who celebrated with us.</p>
	</div>
{:else}
	<div class="text-center" data-testid="countdown">
		<!-- One live region for screen readers; the cards themselves are decorative and
		     would otherwise announce every digit, every second. -->
		<p class="sr-only" aria-live="polite">{spoken}</p>

		<div class="flex items-start justify-center gap-3 sm:gap-5" aria-hidden="true">
			{#each units as unit (unit.label)}
				<div class="flex flex-col items-center">
					<span class="clock flex gap-[0.12em]">
						{#each unit.value.split('') as digit, index (index)}
							<FlipDigit {digit} />
						{/each}
					</span>
					<span class="mt-2 text-[0.62rem] uppercase tracking-widest text-muted sm:text-xs">
						{unit.label}
					</span>
				</div>
			{/each}
		</div>

		<noscript>
			<p class="mt-4 text-xs text-muted">Time remaining as of when this page loaded.</p>
		</noscript>
	</div>
{/if}

<style>
	/* One font-size drives the whole clock: the cards are sized in `em`. */
	.clock {
		font-size: 2rem;
		font-weight: 300;
	}

	@media (min-width: 640px) {
		.clock {
			font-size: 3rem;
		}
	}
</style>
