<script lang="ts">
	import { untrack } from 'svelte';
	import Flash from '$lib/components/Flash.svelte';
	import InvitationPreview from '$lib/components/InvitationPreview.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import { rsvpUrl } from '$shared/rsvp-url';
	import type { InvitationText } from '$shared/invitation-layout';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// --- the design, edited live -------------------------------------------------
	// Seeded once from the stored invitation; from here the form owns it, and the
	// preview re-renders from these values on every keystroke.
	let design = $state(untrack(() => structuredClone(data.invitation)));

	// --- the card ----------------------------------------------------------------
	let preset = $state('5x7');
	let variant = $state<'full' | 'insert'>('full');
	let width = $state(untrack(() => Number(data.defaults.width) || 5));
	let height = $state(untrack(() => Number(data.defaults.height) || 7));
	let forPrintShop = $state(false);
	let format = $state('pdf');

	// --- who it is for -----------------------------------------------------------
	let selected = $state(untrack(() => new Set<string>(data.preselected)));
	let filter = $state('');

	const isInsertPreset = $derived(preset.startsWith('insert'));
	const isCustom = $derived(preset === 'custom');

	const size = $derived.by(() => {
		if (isCustom) return { widthIn: width, heightIn: height };
		const found = data.presets.find((option) => option.key === preset);
		return { widthIn: found?.width ?? 5, heightIn: found?.height ?? 7 };
	});

	const effectiveVariant = $derived<'full' | 'insert'>(isInsertPreset ? 'insert' : variant);

	const visible = $derived(
		filter.trim()
			? data.households.filter((household) =>
					household.name.toLowerCase().includes(filter.trim().toLowerCase())
				)
			: data.households
	);

	/** Whichever household the preview stands in for. */
	const sample = $derived(
		data.households.find((household) => selected.has(household.id)) ?? data.households[0] ?? null
	);

	const previewText = $derived<InvitationText>({
		...design,
		householdName: sample?.name ?? 'The Whitfield Family',
		url: sample ? rsvpUrl(data.siteUrl, sample.token) : `${data.siteUrl}/rsvp/…`
	});

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
</script>

<div>
	<h1 class="font-display text-2xl text-ink">Invitations</h1>
	<p class="mt-1 text-sm text-muted">
		Every line is yours to write. The preview is drawn from the same layout code as the
		PDF, so what you see is where it prints.
	</p>
</div>

<Flash {form} />

<div class="mt-5 grid gap-4 lg:grid-cols-[1fr_22rem]">
	<div class="space-y-4">
		<!-- Wording and style. Saved separately from generating, so the design persists. -->
		<form method="POST" action="?/save" class="card p-5">
			<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />

			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-ink">Wording</h2>
				<button type="submit" class="btn-primary btn-sm">Save design</button>
			</div>

			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label class="label" for="eyebrow">Line above the names</label>
					<input id="eyebrow" name="eyebrow" class="field" bind:value={design.eyebrow} />
				</div>

				<div class="sm:col-span-2">
					<label class="label" for="names">Names</label>
					<input id="names" name="names" class="field" bind:value={design.names} required />
				</div>

				<div class="sm:col-span-2">
					<label class="label" for="inviteLine">Line below the names</label>
					<input id="inviteLine" name="inviteLine" class="field" bind:value={design.inviteLine} />
				</div>

				<div>
					<label class="label" for="dateLine">Date</label>
					<input id="dateLine" name="dateLine" class="field" bind:value={design.dateLine} />
				</div>

				<div>
					<label class="label" for="timeLine">Time</label>
					<input id="timeLine" name="timeLine" class="field" bind:value={design.timeLine} />
				</div>

				<div>
					<label class="label" for="venueName">Venue</label>
					<input id="venueName" name="venueName" class="field" bind:value={design.venueName} />
				</div>

				<div>
					<label class="label" for="qrCaption">Caption under the QR</label>
					<input id="qrCaption" name="qrCaption" class="field" bind:value={design.qrCaption} />
				</div>

				<div class="sm:col-span-2">
					<label class="label" for="venueAddress">Venue address</label>
					<textarea
						id="venueAddress"
						name="venueAddress"
						class="field"
						rows="2"
						bind:value={design.venueAddress}
					></textarea>
				</div>
			</div>

			<h2 class="mt-6 text-sm font-semibold text-ink">Style</h2>

			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="font">Lettering</label>
					<select id="font" name="font" class="field" bind:value={design.font}>
						<option value="serif">Serif — traditional</option>
						<option value="sans">Sans — modern</option>
					</select>
				</div>

				<div>
					<label class="label" for="accent">Accent colour</label>
					<div class="flex items-center gap-2">
						<input
							id="accent"
							type="color"
							class="h-11 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
							bind:value={design.accent}
						/>
						<!-- The colour input posts the same value; the text field is for typing
						     a brand hex exactly. -->
						<input name="accent" class="field font-mono" bind:value={design.accent} maxlength="7" />
					</div>
				</div>
			</div>

			<div class="mt-3 flex flex-wrap gap-4">
				<label class="flex items-center gap-2 text-sm text-ink">
					<input type="checkbox" name="showBorder" value="1" bind:checked={design.showBorder} class="accent-accent" />
					Border
				</label>
				<label class="flex items-center gap-2 text-sm text-ink">
					<input type="checkbox" name="showQr" value="1" bind:checked={design.showQr} class="accent-accent" />
					QR code
				</label>
				<label class="flex items-center gap-2 text-sm text-ink">
					<input type="checkbox" name="showUrl" value="1" bind:checked={design.showUrl} class="accent-accent" />
					Printed link under the QR
				</label>
			</div>

			{#if !design.showQr}
				<p class="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
					With the QR code off, a guest has no way to reach their RSVP from this card.
					Leave the printed link on, or hand out the insert card as well.
				</p>
			{/if}
		</form>

		<!-- Generating is its own form, so the file download never re-posts the design. -->
		<form method="POST" action="/invitations/download" class="card p-5">
			<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />

			<h2 class="text-sm font-semibold text-ink">Print</h2>

			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="preset">Size</label>
					<select id="preset" name="preset" class="field" bind:value={preset}>
						{#each data.presets as option (option.key)}
							<option value={option.key}>{option.label}</option>
						{/each}
						<option value="custom">Custom</option>
					</select>
				</div>

				<div>
					<label class="label" for="format">Output</label>
					<select id="format" name="format" class="field" bind:value={format}>
						<option value="pdf">One PDF, a page per household</option>
						<option value="zip-pdf">ZIP of individual PDFs</option>
						<option value="zip-png">ZIP of QR code PNGs</option>
					</select>
				</div>

				{#if isCustom}
					<div>
						<label class="label" for="width">Width (in)</label>
						<input id="width" name="width" type="number" min="1" max="20" step="0.25" class="field" bind:value={width} />
					</div>
					<div>
						<label class="label" for="height">Height (in)</label>
						<input id="height" name="height" type="number" min="1" max="20" step="0.25" class="field" bind:value={height} />
					</div>
				{/if}
			</div>

			{#if !isInsertPreset}
				<fieldset class="mt-3">
					<legend class="label">Layout</legend>
					<label class="flex items-center gap-2 py-1 text-sm text-ink">
						<input type="radio" name="variant" value="full" bind:group={variant} class="accent-accent" />
						Full invitation
					</label>
					<label class="flex items-center gap-2 py-1 text-sm text-ink">
						<input type="radio" name="variant" value="insert" bind:group={variant} class="accent-accent" />
						QR insert card only
					</label>
				</fieldset>
			{:else}
				<input type="hidden" name="variant" value="insert" />
				<p class="mt-3 text-xs text-muted">Insert sizes always print the QR-only card.</p>
			{/if}

			<label class="mt-3 flex items-start gap-2 text-sm text-ink">
				<input
					type="checkbox"
					name="printShop"
					value="1"
					bind:checked={forPrintShop}
					class="mt-0.5 accent-accent"
				/>
				<span>
					For a print shop
					<span class="block text-xs text-muted">
						Adds 0.125in bleed and crop marks. Leave it off for printing at home --
						the marks would print on the page.
					</span>
				</span>
			</label>

			<button type="submit" class="btn-primary mt-4 w-full sm:w-auto">Generate</button>

			<!-- The selection lives in this form, so it posts with the download. -->
			<div class="mt-5 border-t border-line pt-4">
				<div class="flex flex-wrap items-end justify-between gap-2">
					<p class="text-xs text-muted">
						{selected.size === 0
							? 'Nothing selected — every household will be included.'
							: `${selected.size} selected.`}
					</p>
					<div class="flex gap-2">
						<input class="field w-36" placeholder="Filter" bind:value={filter} aria-label="Filter households" />
						<button type="button" class="btn-ghost btn-sm" onclick={() => (selected = new Set(visible.map((h) => h.id)))}>
							All
						</button>
						<button type="button" class="btn-ghost btn-sm" onclick={() => (selected = new Set())}>
							None
						</button>
					</div>
				</div>

				<ul class="mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
					{#each visible as household (household.id)}
						<li>
							<label class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-sunken">
								<input
									type="checkbox"
									name="ids"
									value={household.id}
									checked={selected.has(household.id)}
									onchange={() => toggle(household.id)}
								/>
								<span class="text-ink">{household.name}</span>
								{#if household.invitationSent}
									<span class="pill-ok ml-auto">Sent</span>
								{/if}
							</label>
						</li>
					{:else}
						<li class="px-3 py-6 text-center text-sm text-muted">No households match.</li>
					{/each}
				</ul>
			</div>
		</form>
	</div>

	<aside class="lg:sticky lg:top-4 lg:self-start">
		<h2 class="mb-3 text-sm font-semibold text-ink">Preview</h2>

		<InvitationPreview
			text={previewText}
			widthIn={size.widthIn}
			heightIn={size.heightIn}
			variant={effectiveVariant}
			bleedIn={forPrintShop ? 0.125 : 0}
			showCropMarks={forPrintShop}
			householdId={sample?.id ?? null}
		/>

		{#if sample}
			<p class="mt-3 text-center text-xs text-muted">
				Showing {sample.name}
			</p>
		{:else}
			<p class="mt-3 text-center text-xs text-muted">
				<a class="text-accent hover:underline" href="/guests">Add a household</a> to see a real
				name and QR code here.
			</p>
		{/if}
	</aside>
</div>
