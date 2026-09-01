<script lang="ts">
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import { formatDateTime } from '$shared/format';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Derived from the URL rather than held locally, so saving a template (which is a
	// real form post, then a redirect) leaves the editor open on what was just saved.
	const editorOpen = $derived(data.editorOpen);
	const firstTemplateHref = $derived(
		data.templates.length > 0 ? `/emails?template=${data.templates[0].id}` : '/emails?template=new'
	);

	let audience = $state('pending');
	let selected = $state(new Set<string>());
	let confirmSend = $state(false);

	const recipientCount = $derived(
		audience === 'selected'
			? [...selected].length
			: audience === 'all'
				? data.households.filter((household) => household.email).length
				: data.pending.filter((household) => household.email).length
	);

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
</script>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="font-display text-2xl text-ink">Reminder emails</h1>
		<p class="mt-1 text-sm text-muted">
			{data.pending.length} household{data.pending.length === 1 ? '' : 's'} still owe you a reply.
		</p>
	</div>
	<!-- A link, not a button: the panel's state is in the URL, so this works without
	     JavaScript and survives a save. -->
	<a href={editorOpen ? '/emails' : firstTemplateHref} class="btn-secondary btn-sm">
		{editorOpen ? 'Close editor' : 'Edit templates'}
	</a>
</div>

<Flash {form} />

{#if data.justSaved}
	<p class="mt-4 rounded-lg border border-ok/40 bg-ok/10 px-4 py-2.5 text-sm text-ok" role="status">
		Template saved.
	</p>
{/if}

{#if !data.mailConfigured}
	<p class="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
		Gmail is not configured. Set <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> in
		<code>.env</code>, then <a class="underline" href="/settings">send yourself a test</a>.
	</p>
{/if}

{#if editorOpen}
	<section class="card mt-4 p-5">
		<div class="flex flex-wrap gap-2">
			{#each data.templates as template (template.id)}
				<a
					href="/emails?template={template.id}"
					class="btn-sm rounded-lg border px-3 py-1.5 text-xs transition-colors"
					class:border-accent={data.selected?.id === template.id}
					class:text-accent={data.selected?.id === template.id}
					class:border-line={data.selected?.id !== template.id}
					class:text-muted={data.selected?.id !== template.id}
				>
					{template.name}
				</a>
			{/each}
			<a href="/emails?template=new" class="btn-ghost btn-sm">+ New template</a>
		</div>

		<div class="mt-5 grid gap-5 lg:grid-cols-2">
			<form method="POST" action="?/saveTemplate" class="space-y-4">
				<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
				<input type="hidden" name="id" value={data.selected?.id ?? ''} />

				<div>
					<label class="label" for="name">Template name</label>
					<input id="name" name="name" class="field" required value={data.selected?.name ?? ''} />
				</div>

				<div>
					<label class="label" for="subject">Subject</label>
					<input
						id="subject"
						name="subject"
						class="field"
						required
						value={data.selected?.subject ?? ''}
					/>
				</div>

				<div>
					<label class="label" for="bodyHtml">Body (HTML)</label>
					<textarea id="bodyHtml" name="bodyHtml" class="field font-mono text-xs" rows="14"
						>{data.selected?.bodyHtml ?? ''}</textarea>
					<p class="mt-1 text-xs text-muted">
						Basic HTML only -- paragraphs, emphasis, lists and links. Anything else is stripped
						before sending.
					</p>
				</div>

				<div class="flex flex-wrap gap-2">
					<button type="submit" class="btn-primary">Save template</button>
				</div>
			</form>

			<div>
				<h3 class="text-sm font-semibold text-ink">Merge fields</h3>
				<ul class="mt-2 space-y-1 text-xs text-muted">
					{#each data.mergeFields as field (field.field)}
						<li>
							<code class="rounded bg-sunken px-1.5 py-0.5 text-ink">
								{'{{' + field.field + '}}'}
							</code>
							-- {field.help}
						</li>
					{/each}
				</ul>

				{#if data.preview}
					<h3 class="mt-6 text-sm font-semibold text-ink">Preview</h3>
					<p class="mt-1 text-xs text-muted">With sample values in place of the merge fields.</p>
					<p class="mt-3 rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-ink">
						<strong>Subject:</strong>
						{data.preview.subject}
					</p>
					<!--
						Rendered rather than shown as source, because what matters is whether the
						email reads well. It is safe: the body was allow-list sanitised on save and
						sanitised again on this read, and merge values are HTML-escaped.
					-->
					<div class="prose-email mt-3 rounded-lg border border-line bg-white p-4 text-sm">
						{@html data.preview.html}
					</div>
				{/if}

				{#if data.selected}
					<form method="POST" action="?/deleteTemplate" class="mt-5 border-t border-line pt-4">
						<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
						<input type="hidden" name="id" value={data.selected.id} />
						<button
							type="submit"
							class="btn-danger btn-sm"
							onclick={(event) => {
								if (!confirm(`Delete the "${data.selected?.name}" template?`)) event.preventDefault();
							}}
						>
							Delete template
						</button>
					</form>
				{/if}
			</div>
		</div>
	</section>
{/if}

<form method="POST" action="?/send" class="card mt-4 p-5">
	<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />

	<h2 class="text-sm font-semibold text-ink">Send a reminder</h2>

	<div class="mt-4 grid gap-5 lg:grid-cols-2">
		<div class="space-y-4">
			<div>
				<label class="label" for="templateId">Template</label>
				<select id="templateId" name="templateId" class="field" required>
					{#each data.templates as template (template.id)}
						<option value={template.id} selected={data.selected?.id === template.id}>
							{template.name}
						</option>
					{/each}
				</select>
			</div>

			<fieldset>
				<legend class="label">Who gets it?</legend>
				{#each [['pending', 'Everyone who has not replied'], ['all', 'Everyone with an email address'], ['selected', 'Pick them below']] as [value, label] (value)}
					<label class="flex items-center gap-2 py-1 text-sm text-ink">
						<input type="radio" name="audience" {value} bind:group={audience} class="accent-accent" />
						{label}
					</label>
				{/each}
			</fieldset>

			<p class="text-sm text-muted">
				This will send <strong class="text-ink">{recipientCount}</strong> email{recipientCount === 1
					? ''
					: 's'}. Households without an email address are skipped.
			</p>

			{#if confirmSend}
				<div class="flex flex-wrap gap-2">
					<button type="submit" class="btn-primary" disabled={recipientCount === 0}>
						Yes, send {recipientCount}
					</button>
					<button type="button" class="btn-ghost" onclick={() => (confirmSend = false)}>
						Cancel
					</button>
				</div>
			{:else}
				<button
					type="button"
					class="btn-primary"
					disabled={!data.mailConfigured || recipientCount === 0}
					onclick={() => (confirmSend = true)}
				>
					Send reminders
				</button>
			{/if}
		</div>

		{#if audience === 'selected'}
			<ul class="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
				{#each data.households as household (household.id)}
					<li>
						<label
							class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-sunken"
							class:opacity-50={!household.email}
						>
							<input
								type="checkbox"
								name="ids"
								value={household.id}
								checked={selected.has(household.id)}
								onchange={() => toggle(household.id)}
								disabled={!household.email}
							/>
							<span class="text-ink">{household.name}</span>
							<span class="ml-auto text-xs text-muted">{household.email ?? 'no email'}</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</form>

<section class="card mt-4 p-5">
	<h2 class="text-sm font-semibold text-ink">Send history</h2>
	{#if data.log.length === 0}
		<p class="mt-3 text-sm text-muted">No emails sent yet.</p>
	{:else}
		<div class="mt-3 overflow-x-auto">
			<table class="w-full min-w-[36rem] text-sm">
				<thead>
					<tr class="border-b border-line">
						<th class="table-head">Sent</th>
						<th class="table-head">Subject</th>
						<th class="table-head">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-line">
					{#each data.log as entry (entry.id)}
						<tr>
							<td class="table-cell whitespace-nowrap text-xs text-muted">
								{formatDateTime(entry.sentAt)}
							</td>
							<td class="table-cell text-ink">{entry.subject}</td>
							<td class="table-cell">
								<span class={entry.status === 'sent' ? 'pill-ok' : 'pill-bad'}>{entry.status}</span>
								{#if entry.error}
									<span class="ml-2 text-xs text-bad">{entry.error}</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	/* The preview renders an email document, which brings its own colours. Constrain it
	   so it cannot leak layout into the admin page around it. */
	.prose-email :global(p) {
		margin: 0 0 0.75rem;
	}

	.prose-email :global(a) {
		color: rgb(var(--c-accent));
		text-decoration: underline;
	}

	.prose-email :global(body),
	.prose-email :global(div) {
		max-width: 100%;
	}
</style>
