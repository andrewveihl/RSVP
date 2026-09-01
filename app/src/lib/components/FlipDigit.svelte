<script lang="ts">
	/**
	 * One split-flap digit.
	 *
	 * The illusion is four stacked halves. Two are static and show the finished state:
	 * the upper half already reads the new digit, the lower half still reads the old
	 * one. Over the top, two leaves animate -- the old digit's upper half falls forward
	 * to horizontal, then the new digit's lower half swings up from horizontal to
	 * vertical, hiding the seam at exactly the moment the eye is following the fold.
	 *
	 * Re-running the animation is the awkward part in any framework: assigning the same
	 * CSS animation twice does nothing. `{#key}` sidesteps it by tearing the leaves down
	 * and rebuilding them on every change, so the animation always starts from frame
	 * zero.
	 */
	import { untrack } from 'svelte';

	let { digit, label }: { digit: string; label?: string } = $props();

	// Seeded from the prop exactly once. `untrack` says so out loud: capturing only the
	// initial value is the intent here, and the effect below is what keeps them current.
	// `previous` is the digit as it was before the latest change -- what the falling
	// leaf shows while the new one swings up behind it.
	let previous = $state(untrack(() => digit));
	let displayed = $state(untrack(() => digit));

	$effect(() => {
		if (digit === displayed) return;
		previous = displayed;
		displayed = digit;
	});
</script>

<span class="digit" aria-hidden={label ? undefined : 'true'}>
	<span class="half top"><span class="glyph">{displayed}</span></span>
	<span class="half bottom"><span class="glyph">{previous}</span></span>

	{#key displayed}
		<span class="half top leaf-front"><span class="glyph">{previous}</span></span>
		<span class="half bottom leaf-back"><span class="glyph">{displayed}</span></span>
	{/key}
</span>

<style>
	.digit {
		position: relative;
		display: inline-block;
		width: 1ch;
		/* The card is sized by its own font, so one variable scales the whole clock. */
		padding: 0.22em 0.26em;
		border-radius: 0.14em;
		background: rgb(var(--c-surface));
		border: 1px solid rgb(var(--c-line));
		box-shadow: 0 1px 2px rgb(var(--c-shadow) / 0.08);
		font-variant-numeric: tabular-nums;
		line-height: 1;
		/* Depth for the rotating leaves. Without it they scale rather than turn. */
		perspective: 12em;
	}

	/* An invisible glyph reserves the height, so the halves can be absolute. */
	.digit::after {
		content: '8';
		visibility: hidden;
	}

	.half {
		position: absolute;
		left: 0;
		width: 100%;
		height: 50%;
		overflow: hidden;
		backface-visibility: hidden;
	}

	.top {
		top: 0;
		border-radius: 0.14em 0.14em 0 0;
		/* The hinge line: a hairline of the page showing through the middle. */
		border-bottom: 1px solid rgb(var(--c-canvas));
		background: rgb(var(--c-surface));
	}

	.bottom {
		bottom: 0;
		border-radius: 0 0 0.14em 0.14em;
		background: rgb(var(--c-sunken));
	}

	.glyph {
		position: absolute;
		left: 0;
		width: 100%;
		height: 200%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.top .glyph {
		top: 0;
	}

	.bottom .glyph {
		bottom: 0;
	}

	.leaf-front {
		transform-origin: bottom center;
		animation: fall 260ms ease-in forwards;
	}

	.leaf-back {
		transform-origin: top center;
		/* `both` holds the first keyframe through the delay, so the new digit's lower
		   half stays folded flat instead of flashing upright for a quarter second. */
		animation: rise 260ms ease-out 260ms both;
	}

	@keyframes fall {
		from {
			transform: rotateX(0deg);
		}
		to {
			transform: rotateX(-90deg);
		}
	}

	@keyframes rise {
		from {
			transform: rotateX(90deg);
		}
		to {
			transform: rotateX(0deg);
		}
	}

	/* Reduced motion: the digit simply changes. No fold, no delay. */
	@media (prefers-reduced-motion: reduce) {
		.leaf-front {
			display: none;
		}

		.leaf-back {
			animation: none;
		}
	}
</style>
