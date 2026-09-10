<script lang="ts">
	import { untrack } from 'svelte';
	import Flash from '$lib/components/Flash.svelte';
	import InvitationPreview from '$lib/components/InvitationPreview.svelte';
	import { downscale } from '$lib/actions/downscale';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import { rsvpUrl } from '$shared/rsvp-url';
	import type { InvitationText } from '$shared/invitation-layout';
	import type { InvitationLine } from '$shared/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// --- the design, edited live -------------------------------------------------
	// Seeded once from the stored invitation; from here the form owns it, and the
	// preview re-renders from these values on every keystroke.
	let design = $state(untrack(() => structuredClone(data.invitation)));

	// The couple's own lines, owned by this form once seeded -- the same working-copy
	// pattern the other content editors use for their repeated rows.
	let lines = $state<InvitationLine[]>(untrack(() => structuredClone(data.invitation.lines ?? [])));

	/**
	 * Whether a second location has been given.
	 *
	 * Drives the labels as well as the layout: with one venue the field is just "Venue",
	 * and the two label fields have nothing to label.
	 */
	const hasReception = $derived(
		Boolean(design.receptionName.trim() || design.receptionAddress.trim())
	);

	function addLine() {
		lines = [
			...lines,
			{ id: `line-new-${lines.length}-${Date.now()}`, text: '', style: 'body', slot: 'bottom' }
		];
	}

	function removeLine(index: number) {
		lines = lines.filter((_, position) => position !== index);
	}

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
		// The live rows, not the saved ones, so a line reads onto the card as it is typed.
		lines,
		householdName: sample?.name ?? 'The Whitfield Family',
		url: sample ? rsvpUrl(data.siteUrl, sample.token) : `${data.siteUrl}/rsvp/…`,
		// Only reserve the space when there is a saved photo to put in it. Ticking the
		// box before choosing a file would otherwise reshape the whole card around an
		// empty grey band -- and the save refuses that combination anyway.
		showPhoto: design.showPhoto && data.invitation.photoId !== null
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
		<form method="POST" action="?/save" enctype="multipart/form-data" class="card p-5">
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
					<label class="label" for="qrCaption">Caption under the QR</label>
					<input id="qrCaption" name="qrCaption" class="field" bind:value={design.qrCaption} />
				</div>
			</div>

			<h2 class="mt-6 text-sm font-semibold text-ink">Where</h2>
			<p class="mt-1 text-xs text-muted">
				Leave the reception blank if it is at the same place. Fill it in and the card
				labels both, so nobody turns up at the wrong one.
			</p>

			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="venueName">
						{hasReception ? 'Ceremony venue' : 'Venue'}
					</label>
					<input id="venueName" name="venueName" class="field" bind:value={design.venueName} />
				</div>

				<div>
					<label class="label" for="ceremonyLabel">Ceremony label</label>
					<input
						id="ceremonyLabel"
						name="ceremonyLabel"
						class="field"
						placeholder="CEREMONY"
						disabled={!hasReception}
						bind:value={design.ceremonyLabel}
					/>
				</div>

				<div class="sm:col-span-2">
					<label class="label" for="venueAddress">
						{hasReception ? 'Ceremony address' : 'Venue address'}
					</label>
					<textarea
						id="venueAddress"
						name="venueAddress"
						class="field"
						rows="2"
						bind:value={design.venueAddress}
					></textarea>
				</div>

				<div>
					<label class="label" for="receptionName">Reception venue</label>
					<input
						id="receptionName"
						name="receptionName"
						class="field"
						placeholder="Same as the ceremony"
						bind:value={design.receptionName}
					/>
				</div>

				<div>
					<label class="label" for="receptionLabel">Reception label</label>
					<input
						id="receptionLabel"
						name="receptionLabel"
						class="field"
						placeholder="RECEPTION"
						disabled={!hasReception}
						bind:value={design.receptionLabel}
					/>
				</div>

				<div class="sm:col-span-2">
					<label class="label" for="receptionAddress">Reception address</label>
					<textarea
						id="receptionAddress"
						name="receptionAddress"
						class="field"
						rows="2"
						bind:value={design.receptionAddress}
					></textarea>
				</div>
			</div>

			<div class="mt-6 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-ink">Your own lines</h2>
				<button type="button" class="btn-secondary btn-sm" onclick={addLine}>Add a line</button>
			</div>
			<p class="mt-1 text-xs text-muted">
				Anything else the card should say -- a dress code, "carriages at midnight", a
				note about children. Each one picks where it sits and how it is set.
			</p>
			<input type="hidden" name="line_count" value={lines.length} />

			{#if lines.length === 0}
				<p class="mt-3 text-sm text-muted">None yet.</p>
			{/if}

			<ul class="mt-3 space-y-2">
				{#each lines as line, index (line.id)}
					<li class="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_8rem_8rem_auto]">
						<input type="hidden" name="line_{index}_id" value={line.id} />
						<input
							name="line_{index}_text"
							class="field"
							placeholder="Black tie optional"
							aria-label="Text for line {index + 1}"
							bind:value={line.text}
						/>
						<select
							name="line_{index}_slot"
							class="field"
							aria-label="Where line {index + 1} sits"
							bind:value={line.slot}
						>
							<option value="top">Under the eyebrow</option>
							<option value="middle">After the time</option>
							<option value="bottom">At the end</option>
						</select>
						<select
							name="line_{index}_style"
							class="field"
							aria-label="How line {index + 1} is set"
							bind:value={line.style}
						>
							<option value="display">Heading</option>
							<option value="body">Normal</option>
							<option value="small">Small note</option>
						</select>
						<button
							type="button"
							class="btn-ghost btn-sm text-bad"
							onclick={() => removeLine(index)}
						>
							Remove
						</button>
					</li>
				{/each}
			</ul>

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

				<div>
					<label class="label" for="ink">Text colour</label>
					<div class="flex items-center gap-2">
						<input
							id="ink"
							type="color"
							class="h-11 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
							bind:value={design.ink}
						/>
						<input name="ink" class="field font-mono" bind:value={design.ink} maxlength="7" />
					</div>
				</div>

				<div>
					<label class="label" for="background">Card colour</label>
					<div class="flex items-center gap-2">
						<input
							id="background"
							type="color"
							class="h-11 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
							bind:value={design.background}
						/>
						<input
							name="background"
							class="field font-mono"
							bind:value={design.background}
							maxlength="7"
						/>
					</div>
					<p class="mt-1 text-xs text-muted">
						Printed as ink, so anything but white uses a lot of it. Cream is the safe one.
					</p>
				</div>

				<div>
					<label class="label" for="align">Alignment</label>
					<select id="align" name="align" class="field" bind:value={design.align}>
						<option value="center">Centred</option>
						<option value="left">Ranged left</option>
					</select>
				</div>

				<div>
					<label class="label" for="qrPosition">QR code</label>
					<select id="qrPosition" name="qrPosition" class="field" bind:value={design.qrPosition}>
						<option value="foot">Centred at the foot</option>
						<option value="corner">Bottom corner, name beside it</option>
					</select>
				</div>

				<div>
					<label class="label" for="scale">
						Type size &middot; {Math.round(design.scale * 100)}%
					</label>
					<input
						id="scale"
						name="scale"
						type="range"
						min="0.7"
						max="1.5"
						step="0.05"
						class="w-full accent-accent"
						bind:value={design.scale}
					/>
				</div>

				<div>
					<label class="label" for="spacing">
						Line spacing &middot; {Math.round(design.spacing * 100)}%
					</label>
					<input
						id="spacing"
						name="spacing"
						type="range"
						min="0.6"
						max="1.8"
						step="0.05"
						class="w-full accent-accent"
						bind:value={design.spacing}
					/>
				</div>
			</div>

			{#if design.scale > 1.15 || design.spacing > 1.3}
				<p class="mt-3 rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-muted">
					Big settings can push the wording past the QR block. A long line shrinks itself
					to fit the width, but nothing shrinks it to fit the height -- watch the preview.
				</p>
			{/if}

			<h2 class="mt-6 text-sm font-semibold text-ink">Photo</h2>

			<div class="mt-3">
				{#if data.invitation.photoId}
					<!-- No "photo" or "image" in the alt text: a screen reader announces
					     "image" already, so naming it again reads as a stutter. -->
					<img
						src="/images/{data.invitation.photoId}"
						alt="Currently on the invitation"
						class="mb-2 max-h-40 rounded-lg border border-line object-contain"
					/>
					<label class="mb-2 flex items-center gap-2 text-sm text-muted">
						<input type="checkbox" name="removePhoto" value="1" class="accent-accent" />
						Remove this photo
					</label>
				{/if}

				<label class="label" for="photo">
					{data.invitation.photoId ? 'Replace it' : 'Add a photo'}
				</label>
				<input
					id="photo"
					name="photo"
					type="file"
					accept="image/jpeg,image/png"
					class="field"
					use:downscale
					onchange={() => (design.showPhoto = true)}
				/>
				<p class="mt-1 text-xs text-muted">
					JPEG or PNG only -- those are the two formats that can go into a print-ready PDF.
					It appears on the full invitation only; the QR insert card stays as it is.
				</p>

				<div class="mt-3">
					<label class="label" for="photoMode">How it is used</label>
					<select id="photoMode" name="photoMode" class="field" bind:value={design.photoMode}>
						<option value="band">A band across the top</option>
						<option value="background">Behind the whole card</option>
					</select>
					<p class="mt-1 text-xs text-muted">
						{#if design.photoMode === 'background'}
							The card is tinted over the photo so the wording stays readable. A quiet
							picture works far better than a busy one.
						{:else}
							Sized to whatever room your wording leaves, and dropped if there is none.
						{/if}
					</p>
				</div>
			</div>

			<div class="mt-3 flex flex-wrap gap-4">
				<label class="flex items-center gap-2 text-sm text-ink">
					<!--
						Never disabled, even with no photo stored yet: choosing a file and
						ticking this in one go has to work, and at that moment the photo
						exists only in the file input. The server refuses the flag when no
						photo ends up saved, which is the check that actually matters.
					-->
					<input
						type="checkbox"
						name="showPhoto"
						value="1"
						bind:checked={design.showPhoto}
						class="accent-accent"
					/>
					Photo
				</label>
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
			photoId={data.invitation.photoId}
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
