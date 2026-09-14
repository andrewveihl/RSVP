<script lang="ts">
	import { untrack } from 'svelte';
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { ActionData, PageData } from './$types';
	import { downscale } from '$lib/actions/downscale';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Where the hero photo is anchored once the home page crops it. Seeded once and
	// owned by this form from then on, the same working copy the other editors keep.
	let focus = $state(untrack(() => ({ x: data.hero.focusX, y: data.hero.focusY })));

	const percent = (offset: number, size: number) =>
		Math.min(100, Math.max(0, Math.round((offset / size) * 100)));

	/** Puts the point where the pointer is, as a percentage of the whole photo. */
	function place(event: PointerEvent) {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		focus.x = percent(event.clientX - box.left, box.width);
		focus.y = percent(event.clientY - box.top, box.height);
	}

	function startDrag(event: PointerEvent) {
		// Captured, so a drag that runs off the edge of the photo keeps steering the
		// point instead of stopping wherever the pointer crossed it.
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		place(event);
	}

	function drag(event: PointerEvent) {
		if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) place(event);
	}

	const toggles: { key: keyof typeof data.sections; label: string; hint: string }[] = [
		{ key: 'countdown', label: 'Countdown clock', hint: 'The flip clock on the home page' },
		{ key: 'story', label: 'Our story', hint: 'Timeline and narrative' },
		{ key: 'details', label: 'Event details', hint: 'Date, venue, dress code' },
		{ key: 'party', label: 'Wedding party', hint: 'Photo cards for the party' },
		{ key: 'gallery', label: 'Photos', hint: 'The curated gallery' },
		{ key: 'registry', label: 'Registry', hint: 'Links to your registries' },
		{ key: 'faq', label: 'FAQ', hint: 'Accordion of questions' }
	];
</script>

<ContentNav siteUrl={data.siteUrl} />
<Flash {form} />

<div class="mt-5 grid gap-4 lg:grid-cols-2">
	<form
		method="POST"
		action="?/saveHero"
		enctype="multipart/form-data"
		class="card space-y-4 p-5"
	>
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
		<h2 class="text-sm font-semibold text-ink">Home page</h2>

		<div>
			<label class="label" for="subtitle">Line above the names</label>
			<input id="subtitle" name="subtitle" class="field" value={data.hero.subtitle} />
		</div>

		<div>
			<label class="label" for="title">Names</label>
			<input id="title" name="title" class="field" value={data.hero.title} />
		</div>

		<div>
			<label class="label" for="dateLine">Line below the names</label>
			<input id="dateLine" name="dateLine" class="field" value={data.hero.dateLine} />
		</div>

		<div>
			<label class="label" for="image">Background photo</label>
			{#if data.hero.imageId}
				<!--
					The whole photo with the chosen point marked on it, and beside it the
					crop the home page will make. A hero fills the window, so on a wide
					screen a tall photo loses its top and bottom -- this is where the couple
					say which part survives that.
				-->
				<div class="mb-3 grid gap-3 sm:grid-cols-2">
					<div>
						<p class="label">Drag to choose what stays in frame</p>
						<button
							type="button"
							class="relative inline-block max-w-full touch-none overflow-hidden rounded-lg border border-line"
							aria-label="Set the focal point by dragging on the photo. The Across and Down sliders do the same thing."
							onpointerdown={startDrag}
							onpointermove={drag}
						>
							<!-- Not draggable: a native image drag cancels the pointer capture, and
							     the marker would stick after the first few pixels. -->
							<img
								src="/images/{data.hero.imageId}"
								alt=""
								draggable="false"
								class="block max-h-72 w-auto max-w-full select-none"
							/>
							<!-- A white ring rather than a palette colour: this sits on a photo, not on
							     the app's own surfaces, and it has to stay findable on a dark one. -->
							<span
								class="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2
									rounded-full border-2 border-white bg-accent shadow-card"
								style="left: {focus.x}%; top: {focus.y}%"
							></span>
						</button>
					</div>

					<div>
						<p class="label">How a wide screen crops it</p>
						<img
							src="/images/{data.hero.imageId}"
							alt="Your home page background, framed to the point you chose"
							class="aspect-[2/1] w-full rounded-lg border border-line object-cover"
							style="object-position: {focus.x}% {focus.y}%"
						/>
					</div>
				</div>

				<div class="mb-3 grid gap-3 sm:grid-cols-2">
					<div>
						<label class="label" for="focusX">Across &middot; {focus.x}%</label>
						<input
							id="focusX"
							name="focusX"
							type="range"
							min="0"
							max="100"
							class="w-full accent-accent"
							bind:value={focus.x}
						/>
					</div>
					<div>
						<label class="label" for="focusY">Down &middot; {focus.y}%</label>
						<input
							id="focusY"
							name="focusY"
							type="range"
							min="0"
							max="100"
							class="w-full accent-accent"
							bind:value={focus.y}
						/>
					</div>
				</div>

				<label class="mb-2 flex items-center gap-2 text-sm text-muted">
					<input type="checkbox" name="removeImage" value="1" class="accent-accent" />
					Remove this photo
				</label>
			{/if}
			<input id="image" name="image" type="file" accept="image/*" class="field" use:downscale />
			<p class="mt-1 text-xs text-muted">
				JPEG, PNG, WebP, GIF or AVIF, up to 8MB. A wide photo works best; the text sits over
				a soft scrim so it stays readable.
			</p>
		</div>

		<button type="submit" class="btn-primary">Save home page</button>
	</form>

	<form method="POST" action="?/saveSections" class="card space-y-4 p-5">
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
		<h2 class="text-sm font-semibold text-ink">Which sections appear</h2>
		<p class="-mt-2 text-xs text-muted">
			Switching one off removes it from the navigation and makes its page 404.
		</p>

		<ul class="divide-y divide-line">
			{#each toggles as toggle (toggle.key)}
				<li class="flex items-center gap-3 py-2.5">
					<input
						id="section_{toggle.key}"
						type="checkbox"
						name="section_{toggle.key}"
						value="1"
						checked={data.sections[toggle.key]}
						class="accent-accent"
					/>
					<label for="section_{toggle.key}" class="text-sm text-ink">
						{toggle.label}
						<span class="block text-xs text-muted">{toggle.hint}</span>
					</label>
				</li>
			{/each}
		</ul>

		<div>
			<label class="label" for="announcement">Announcement banner</label>
			<input
				id="announcement"
				name="announcement"
				class="field"
				placeholder="Leave empty to hide it"
				value={data.announcement}
			/>
			<p class="mt-1 text-xs text-muted">
				Shown across the top of every page -- for a change of plan, or a nudge about the
				deadline.
			</p>
		</div>

		<button type="submit" class="btn-primary">Save sections</button>
	</form>
</div>
