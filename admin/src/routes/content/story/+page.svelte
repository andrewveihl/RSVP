<script lang="ts">
	import { untrack } from 'svelte';
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { downscale } from '$lib/actions/downscale';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { StoryMilestone } from '$shared/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// A local copy so rows can be added, removed and reordered before saving; the form
	// posts whatever this array ends up holding. `untrack` marks the one-time read of
	// the loaded content as deliberate.
	let milestones = $state<StoryMilestone[]>(untrack(() => structuredClone(data.story.milestones)));

	function add() {
		milestones = [
			...milestones,
			{ id: `milestone-new-${milestones.length}-${Date.now()}`, date: '', title: '', description: '', imageId: null }
		];
	}

	function remove(index: number) {
		milestones = milestones.filter((_, position) => position !== index);
	}

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= milestones.length) return;
		const next = [...milestones];
		[next[index], next[target]] = [next[target], next[index]];
		milestones = next;
	}
</script>

<ContentNav siteUrl={data.siteUrl} />
<Flash {form} />

<form method="POST" action="?/save" enctype="multipart/form-data" class="mt-5 space-y-4">
	<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
	<!-- The server walks this count and skips the gaps left by removed rows. -->
	<input type="hidden" name="milestone_count" value={milestones.length} />

	<section class="card space-y-4 p-5">
		<div>
			<label class="label" for="heading">Page heading</label>
			<input id="heading" name="heading" class="field" value={data.story.heading} />
		</div>
	</section>

	<section class="card p-5">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold text-ink">Timeline</h2>
			<button type="button" class="btn-secondary btn-sm" onclick={add}>Add milestone</button>
		</div>

		{#if milestones.length === 0}
			<p class="mt-4 text-sm text-muted">No milestones yet.</p>
		{/if}

		<ul class="mt-4 space-y-4">
			{#each milestones as milestone, index (milestone.id)}
				<li class="rounded-xl border border-line p-4">
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs uppercase tracking-wide text-muted">Milestone {index + 1}</span>
						<div class="flex gap-1">
							<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, -1)} aria-label="Move up">
								&uarr;
							</button>
							<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, 1)} aria-label="Move down">
								&darr;
							</button>
							<button type="button" class="btn-ghost btn-sm text-bad" onclick={() => remove(index)}>
								Remove
							</button>
						</div>
					</div>

					<input type="hidden" name="milestone_{index}_id" value={milestone.id} />

					<div class="mt-3 grid gap-3 sm:grid-cols-3">
						<div>
							<label class="label" for="milestone_{index}_date">Date label</label>
							<input
								id="milestone_{index}_date"
								name="milestone_{index}_date"
								class="field"
								placeholder="Summer 2021"
								value={milestone.date}
							/>
						</div>
						<div class="sm:col-span-2">
							<label class="label" for="milestone_{index}_title">Title</label>
							<input
								id="milestone_{index}_title"
								name="milestone_{index}_title"
								class="field"
								value={milestone.title}
							/>
						</div>
					</div>

					<div class="mt-3">
						<label class="label" for="milestone_{index}_description">Description</label>
						<textarea
							id="milestone_{index}_description"
							name="milestone_{index}_description"
							class="field"
							rows="3">{milestone.description}</textarea>
					</div>

					<div class="mt-3">
						<label class="label" for="milestone_{index}_image">Photo</label>
						{#if milestone.imageId}
							<img
								src="/images/{milestone.imageId}"
								alt=""
								class="mb-2 h-28 rounded-lg border border-line object-cover"
							/>
							<label class="mb-2 flex items-center gap-2 text-sm text-muted">
								<input
									type="checkbox"
									name="milestone_{index}_removeImage"
									value="1"
									class="accent-accent"
								/>
								Remove this photo
							</label>
						{/if}
						<input
							id="milestone_{index}_image"
							name="milestone_{index}_image"
							type="file"
							accept="image/*"
							use:downscale
							class="field"
						/>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<section class="card p-5">
		<h2 class="text-sm font-semibold text-ink">The longer version</h2>
		<p class="mt-1 text-xs text-muted">
			Plain text. Leave a blank line between paragraphs and they render as paragraphs.
		</p>
		<textarea name="narrative" class="field mt-3" rows="10">{data.story.narrative}</textarea>
	</section>

	<button type="submit" class="btn-primary">Save Our Story</button>
</form>
