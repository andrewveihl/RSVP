<script lang="ts">
	import { untrack } from 'svelte';
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { SiteImage } from '$shared/types';
	import type { ActionData, PageData } from './$types';
	import { downscale } from '$lib/actions/downscale';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// A working copy, seeded once from the loaded content and then owned by this
	// form until it is saved. `untrack` marks that one-time read as deliberate.
	let order = $state<SiteImage[]>(untrack(() => [...data.images]));

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= order.length) return;
		const next = [...order];
		[next[index], next[target]] = [next[target], next[index]];
		order = next;
	}

	const reordered = $derived(order.some((image, index) => image.id !== data.images[index]?.id));
</script>

<ContentNav siteUrl={data.siteUrl} />
<Flash {form} />

<div class="mt-5 grid gap-4 lg:grid-cols-2">
	<form method="POST" action="?/saveText" class="card space-y-4 p-5">
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
		<h2 class="text-sm font-semibold text-ink">Wording</h2>

		<div>
			<label class="label" for="heading">Page heading</label>
			<input id="heading" name="heading" class="field" value={data.gallery.heading} />
		</div>

		<div>
			<label class="label" for="intro">Intro line</label>
			<input id="intro" name="intro" class="field" value={data.gallery.intro} />
		</div>

		<div>
			<label class="label" for="uploaderUrl">Link to your photo app</label>
			<input
				id="uploaderUrl"
				name="uploaderUrl"
				type="url"
				class="field"
				placeholder="https://photos.example.duckdns.org"
				value={data.gallery.uploaderUrl}
			/>
			<p class="mt-1 text-xs text-muted">
				Leave empty to hide the callout. Point it at your photo uploader so guests can
				add their own shots.
			</p>
		</div>

		<div>
			<label class="label" for="uploaderNote">Callout wording</label>
			<input id="uploaderNote" name="uploaderNote" class="field" value={data.gallery.uploaderNote} />
		</div>

		<button type="submit" class="btn-primary">Save wording</button>
	</form>

	<form method="POST" action="?/upload" enctype="multipart/form-data" class="card space-y-4 p-5">
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
		<h2 class="text-sm font-semibold text-ink">Add photos</h2>

		<div>
			<label class="label" for="images">Choose files</label>
			<input id="images" name="images" type="file" accept="image/*" multiple class="field" use:downscale />
			<p class="mt-1 text-xs text-muted">
				Several at once is fine. Each is checked against its own bytes, not the name, and
				capped at 8MB -- resize large originals first, the site does not need them.
			</p>
		</div>

		<button type="submit" class="btn-primary">Upload</button>
	</form>
</div>

<section class="card mt-4 p-5">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-sm font-semibold text-ink">
			Gallery ({data.images.length} photo{data.images.length === 1 ? '' : 's'})
		</h2>

		{#if reordered}
			<form method="POST" action="?/reorder">
				<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
				{#each order as image (image.id)}
					<input type="hidden" name="order" value={image.id} />
				{/each}
				<button type="submit" class="btn-primary btn-sm">Save this order</button>
			</form>
		{/if}
	</div>

	{#if order.length === 0}
		<p class="mt-4 text-sm text-muted">No photos yet.</p>
	{:else}
		<ul class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each order as image, index (image.id)}
				<li class="overflow-hidden rounded-lg border border-line">
					<img src="/images/{image.id}" alt="" class="aspect-square w-full object-cover" />
					<div class="flex items-center justify-between gap-1 px-2 py-1.5">
						<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, -1)} aria-label="Move earlier">
							&larr;
						</button>
						<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, 1)} aria-label="Move later">
							&rarr;
						</button>
						<form method="POST" action="?/remove" class="ml-auto">
							<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
							<input type="hidden" name="id" value={image.id} />
							<button
								type="submit"
								class="btn-ghost btn-sm text-bad"
								onclick={(event) => {
									if (!confirm('Remove this photo from the gallery?')) event.preventDefault();
								}}
							>
								Delete
							</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
