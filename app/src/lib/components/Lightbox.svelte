<script lang="ts">
	/**
	 * Full-screen photo viewer.
	 *
	 * Built on the native `<dialog>` element, which brings focus trapping, Escape to
	 * close and inertness of the page behind it for free -- all things a hand-rolled
	 * overlay gets subtly wrong.
	 */
	import type { SiteImage } from '$shared/types';

	let { images }: { images: SiteImage[] } = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let index = $state(0);

	const current = $derived(images[index]);

	function open(at: number) {
		index = at;
		dialog?.showModal();
	}

	function step(delta: number) {
		if (images.length === 0) return;
		// Wrap in both directions, so the arrows never dead-end.
		index = (index + delta + images.length) % images.length;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') step(1);
		if (event.key === 'ArrowLeft') step(-1);
	}
</script>

<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
	{#each images as image, at (image.id)}
		<li>
			<button
				type="button"
				class="group block w-full overflow-hidden rounded-xl border border-line bg-sunken focus-visible:ring-2 focus-visible:ring-accent"
				onclick={() => open(at)}
				aria-label="View photo {at + 1} of {images.length}"
			>
				<img
					src="/images/{image.id}"
					alt=""
					loading="lazy"
					decoding="async"
					class="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
				/>
			</button>
		</li>
	{/each}
</ul>

<dialog
	bind:this={dialog}
	class="max-h-[92vh] max-w-[94vw] rounded-2xl border border-line bg-surface p-0 backdrop:bg-black/70"
	onkeydown={onKeydown}
	onclose={() => (index = 0)}
>
	{#if current}
		<div class="relative">
			<img
				src="/images/{current.id}"
				alt=""
				class="max-h-[80vh] w-auto max-w-full object-contain"
			/>

			<div class="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
				<button type="button" class="btn-ghost" onclick={() => step(-1)} aria-label="Previous photo">
					&larr;
				</button>
				<span class="text-xs text-muted">{index + 1} / {images.length}</span>
				<div class="flex items-center gap-1">
					<button type="button" class="btn-ghost" onclick={() => step(1)} aria-label="Next photo">
						&rarr;
					</button>
					<button type="button" class="btn-ghost" onclick={() => dialog?.close()}>Close</button>
				</div>
			</div>
		</div>
	{/if}
</dialog>
