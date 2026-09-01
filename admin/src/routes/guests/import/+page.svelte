<script lang="ts">
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dragging = $state(false);
	let fileName = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (!file || !fileInput) return;

		// A DataTransfer is the only way to put a dropped file into an <input type=file>
		// so the ordinary form submission carries it.
		const transfer = new DataTransfer();
		transfer.items.add(file);
		fileInput.files = transfer.files;
		fileName = file.name;
	}
</script>

<div>
	<a href="/guests" class="text-xs text-muted hover:text-ink">&larr; All guests</a>
	<h1 class="mt-1 font-display text-2xl text-ink">Import a CSV</h1>
	<p class="mt-1 text-sm text-muted">
		Upload a spreadsheet export, tell us which column is which, then confirm.
	</p>
</div>

<Flash {form} />

{#if form?.stage === 'done'}
	<section class="card mt-5 p-6 text-center">
		<p class="text-2xl font-semibold text-ink">{form.created} added</p>
		<p class="mt-1 text-sm text-muted">
			{form.updated} updated &middot; {form.skipped} skipped
		</p>
		<div class="mt-5 flex justify-center gap-2">
			<a href="/guests" class="btn-primary">See the guest list</a>
			<a href="/guests/import" class="btn-secondary">Import another</a>
		</div>
	</section>
{:else if form?.stage === 'preview'}
	<form method="POST" action="?/confirm" class="mt-5 space-y-4">
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
		<!-- The parsed file, carried through so step two needs no server-side state. -->
		<input type="hidden" name="csv" value={form.csv} />

		<section class="card p-5">
			<h2 class="text-sm font-semibold text-ink">Map the columns</h2>
			<p class="text-xs text-muted">
				{form.rowCount} rows found. We guessed these from your headers -- correct anything wrong.
			</p>

			<div class="mt-4 overflow-x-auto">
				<table class="w-full min-w-[40rem] text-sm">
					<thead>
						<tr class="border-b border-line">
							{#each form.headers as header, index (index)}
								<th class="table-head">
									<span class="block truncate text-ink" title={header}>{header || '(no header)'}</span>
									<select name="map_{index}" class="field mt-2 text-xs">
										{#each data.fields as field (field.value)}
											<option value={field.value} selected={form.mapping[index] === field.value}>
												{field.label}
											</option>
										{/each}
									</select>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-line">
						{#each form.sample as row, rowIndex (rowIndex)}
							<tr>
								{#each form.headers as _, columnIndex (columnIndex)}
									<td class="table-cell max-w-[14rem] truncate text-muted">
										{row[columnIndex] ?? ''}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		{#if form.problemCount > 0}
			<section class="card border-warn/40 p-5">
				<h2 class="text-sm font-semibold text-warn">
					{form.problemCount} row{form.problemCount === 1 ? '' : 's'} need attention
				</h2>
				<ul class="mt-3 space-y-1 text-sm text-muted">
					{#each form.problems as problem (problem.line)}
						<li>Line {problem.line}: {problem.message}</li>
					{/each}
				</ul>
				{#if form.problemCount > form.problems.length}
					<p class="mt-2 text-xs text-muted">
						...and {form.problemCount - form.problems.length} more.
					</p>
				{/if}
			</section>
		{/if}

		{#if form.duplicatesInFile.length > 0 || form.existingDuplicates.length > 0}
			<section class="card p-5">
				<h2 class="text-sm font-semibold text-ink">Duplicates</h2>

				{#if form.duplicatesInFile.length > 0}
					<p class="mt-2 text-sm text-muted">
						Repeated inside the file: {form.duplicatesInFile.join(', ')}
					</p>
				{/if}
				{#if form.existingDuplicates.length > 0}
					<p class="mt-2 text-sm text-muted">
						Already on the guest list: {form.existingDuplicates.join(', ')}
					</p>
				{/if}

				<fieldset class="mt-4">
					<legend class="label">What should happen to those?</legend>
					<label class="flex items-center gap-2 py-1 text-sm text-ink">
						<input type="radio" name="onDuplicate" value="skip" checked class="accent-accent" />
						Skip them -- keep what is already on the list
					</label>
					<label class="flex items-center gap-2 py-1 text-sm text-ink">
						<input type="radio" name="onDuplicate" value="update" class="accent-accent" />
						Update them with the details from this file
					</label>
					<p class="mt-2 text-xs text-muted">
						Either way, existing RSVP links are never changed -- an invitation already in
						the post keeps working.
					</p>
				</fieldset>
			</section>
		{:else}
			<input type="hidden" name="onDuplicate" value="skip" />
		{/if}

		<div class="flex gap-2">
			<button type="submit" class="btn-primary">Import {form.rowCount} rows</button>
			<a href="/guests/import" class="btn-ghost">Start over</a>
		</div>
	</form>
{:else}
	<form method="POST" action="?/preview" enctype="multipart/form-data" class="card mt-5 p-6">
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="rounded-xl border-2 border-dashed p-10 text-center transition-colors"
			class:border-accent={dragging}
			class:border-line={!dragging}
			ondragover={(event) => {
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={onDrop}
		>
			<p class="text-sm text-muted">Drag a CSV here, or</p>
			<label class="btn-secondary btn-sm mt-3 cursor-pointer">
				Choose a file
				<input
					bind:this={fileInput}
					type="file"
					name="file"
					accept=".csv,text/csv"
					class="sr-only"
					onchange={(event) => (fileName = event.currentTarget.files?.[0]?.name ?? '')}
					required
				/>
			</label>
			{#if fileName}
				<p class="mt-3 text-sm text-ink">{fileName}</p>
			{/if}
		</div>

		<button type="submit" class="btn-primary mt-5">Preview import</button>

		<p class="mt-4 text-xs text-muted">
			Any column layout works -- you map the columns on the next screen. A household name
			column is the only requirement.
		</p>
	</form>
{/if}
