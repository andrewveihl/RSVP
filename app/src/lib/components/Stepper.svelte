<script lang="ts">
	/**
	 * A number chosen with buttons rather than typed.
	 *
	 * On a phone a numeric input opens the keyboard, which covers roughly half the
	 * screen -- including, on this form, the submit button. Two big buttons and a
	 * readout avoid the keyboard entirely, and every target clears 48px.
	 *
	 * The real `<input>` is still present and still named, just visually hidden, so the
	 * form posts a value with JavaScript disabled and browser validation still applies.
	 * Without scripts the guest sees a plain number field and the buttons do nothing,
	 * which is exactly the right degradation.
	 */
	let {
		name,
		value = $bindable(),
		min = 1,
		max = 50,
		label,
		describedBy = undefined
	}: {
		name: string;
		value: number;
		min?: number;
		max?: number;
		label: string;
		describedBy?: string;
	} = $props();

	const clamp = (next: number) => Math.min(max, Math.max(min, next));

	function step(delta: number) {
		value = clamp(value + delta);
	}
</script>

<div class="flex items-center justify-center gap-4">
	<button
		type="button"
		class="stepper-btn"
		onclick={() => step(-1)}
		disabled={value <= min}
		aria-label="One fewer"
	>
		&minus;
	</button>

	<!--
		`aria-live` on the readout rather than the input: a screen reader should announce
		the new total when a button is pressed, which a silent input value would not do.
	-->
	<span
		class="readout min-w-[2.5ch] text-center font-display text-5xl tabular-nums text-ink"
		aria-live="polite"
		aria-atomic="true"
	>
		{value}
	</span>

	<button
		type="button"
		class="stepper-btn"
		onclick={() => step(1)}
		disabled={value >= max}
		aria-label="One more"
	>
		+
	</button>

	<label class="fallback-label" for={name}>{label}</label>
	<input
		id={name}
		{name}
		type="number"
		class="fallback-input"
		inputmode="numeric"
		{min}
		{max}
		step="1"
		bind:value
		aria-describedby={describedBy}
	/>
</div>

<style>
	/*
	 * With scripts the buttons do the work and the real input is hidden from sight but
	 * still posted. Without them the buttons cannot do anything, so they are removed and
	 * the input takes their place -- which is the whole point of keeping a real one.
	 */
	.fallback-label,
	.fallback-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	:global(.no-js) .stepper-btn,
	:global(.no-js) .readout {
		display: none;
	}

	:global(.no-js) .fallback-label {
		position: static;
		width: auto;
		height: auto;
		margin: 0;
		overflow: visible;
		clip: auto;
		white-space: normal;
	}

	:global(.no-js) .fallback-input {
		position: static;
		width: 6rem;
		height: auto;
		margin: 0;
		overflow: visible;
		clip: auto;
		white-space: normal;
		border-width: 1px;
		border-color: rgb(var(--c-line));
		border-radius: 0.75rem;
		padding: 0.75rem;
		text-align: center;
		font-size: 1.25rem;
		background: rgb(var(--c-surface));
		color: rgb(var(--c-ink));
	}

	.stepper-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 9999px;
		border: 1px solid rgb(var(--c-line));
		background: rgb(var(--c-surface));
		color: rgb(var(--c-ink));
		font-size: 1.5rem;
		line-height: 1;
		transition: border-color 150ms, color 150ms;
		/* Stops a double-tap on the buttons zooming the page on iOS. */
		touch-action: manipulation;
		-webkit-user-select: none;
		user-select: none;
	}

	.stepper-btn:hover:not(:disabled) {
		border-color: rgb(var(--c-accent));
		color: rgb(var(--c-accent));
	}

	.stepper-btn:disabled {
		opacity: 0.35;
	}
</style>
