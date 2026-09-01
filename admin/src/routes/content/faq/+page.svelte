<script lang="ts">
	import { untrack } from 'svelte';
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { FaqItem } from '$shared/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// A working copy, seeded once from the loaded content and then owned by this
	// form until it is saved. `untrack` marks that one-time read as deliberate.
	let items = $state<FaqItem[]>(untrack(() => structuredClone(data.faq.items)));

	/** Templates already on the page are not offered again. */
	const available = $derived(
		data.templates.filter(
			(template) =>
				!items.some((item) => item.question.trim().toLowerCase() === template.question.toLowerCase())
		)
	);

	function add(question = '', answer = '') {
		items = [...items, { id: `faq-new-${items.length}-${Date.now()}`, question, answer }];
	}

	function remove(index: number) {
		items = items.filter((_, position) => position !== index);
	}

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= items.length) return;
		const next = [...items];
		[next[index], next[target]] = [next[target], next[index]];
		items = next;
	}
</script>

<ContentNav siteUrl={data.siteUrl} />
<Flash {form} />

<form method="POST" action="?/save" class="mt-5 space-y-4">
	<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
	<input type="hidden" name="faq_count" value={items.length} />

	<section class="card grid gap-4 p-5 sm:grid-cols-2">
		<div>
			<label class="label" for="heading">Page heading</label>
			<input id="heading" name="heading" class="field" value={data.faq.heading} />
		</div>
		<div>
			<label class="label" for="intro">Intro line</label>
			<input id="intro" name="intro" class="field" value={data.faq.intro} />
		</div>
	</section>

	{#if available.length > 0}
		<section class="card p-5">
			<h2 class="text-sm font-semibold text-ink">Common questions</h2>
			<p class="mt-1 text-xs text-muted">
				Add one as a starting point, then edit the answer to suit.
			</p>
			<div class="mt-3 flex flex-wrap gap-2">
				{#each available as template (template.id)}
					<button
						type="button"
						class="btn-secondary btn-sm"
						onclick={() => add(template.question, template.answer)}
					>
						+ {template.question}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<section class="card p-5">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold text-ink">Questions</h2>
			<button type="button" class="btn-secondary btn-sm" onclick={() => add()}>
				Add a question
			</button>
		</div>

		{#if items.length === 0}
			<p class="mt-4 text-sm text-muted">No questions yet.</p>
		{/if}

		<ul class="mt-4 space-y-4">
			{#each items as item, index (item.id)}
				<li class="rounded-xl border border-line p-4">
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs uppercase tracking-wide text-muted">#{index + 1}</span>
						<div class="flex gap-1">
							<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, -1)} aria-label="Move earlier">
								&uarr;
							</button>
							<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, 1)} aria-label="Move later">
								&darr;
							</button>
							<button type="button" class="btn-ghost btn-sm text-bad" onclick={() => remove(index)}>
								Remove
							</button>
						</div>
					</div>

					<input type="hidden" name="faq_{index}_id" value={item.id} />

					<div class="mt-3 space-y-3">
						<div>
							<label class="label" for="faq_{index}_question">Question</label>
							<input
								id="faq_{index}_question"
								name="faq_{index}_question"
								class="field"
								value={item.question}
							/>
						</div>
						<div>
							<label class="label" for="faq_{index}_answer">Answer</label>
							<textarea id="faq_{index}_answer" name="faq_{index}_answer" class="field" rows="3"
								>{item.answer}</textarea>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<button type="submit" class="btn-primary">Save FAQ</button>
</form>
