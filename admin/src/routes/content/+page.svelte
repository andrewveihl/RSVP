<script lang="ts">
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { ActionData, PageData } from './$types';
	import { downscale } from '$lib/actions/downscale';

	let { data, form }: { data: PageData; form: ActionData } = $props();

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
				<img
					src="/images/{data.hero.imageId}"
					alt="Current hero background"
					class="mb-2 aspect-[16/9] w-full rounded-lg border border-line object-cover"
				/>
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
