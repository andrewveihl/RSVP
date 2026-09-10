<script lang="ts">
	import { untrack } from 'svelte';
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let accent = $state(untrack(() => data.theme.accent));
	let ink = $state(untrack(() => data.theme.ink));
	let fonts = $state(untrack(() => data.theme.fonts));

	// The order is a local array so it can be rearranged before saving; the form posts
	// one hidden field per row, in exactly this order.
	let order = $state(
		untrack(() => {
			const known = data.orderable.map((section) => section.key);
			const chosen = data.theme.order.filter((key) => known.includes(key as never));
			return [...chosen, ...known.filter((key) => !chosen.includes(key))] as string[];
		})
	);

	const labelFor = (key: string) =>
		data.orderable.find((section) => section.key === key)?.label ?? key;

	const enabled = (key: string) => data.sections[key as keyof typeof data.sections];

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= order.length) return;
		const next = [...order];
		[next[index], next[target]] = [next[target], next[index]];
		order = next;
	}

	/** Six ready-made accents, so nobody has to know what a hex value is. */
	const swatches = [
		{ hex: '#8A9A7B', name: 'Sage' },
		{ hex: '#B08968', name: 'Warm tan' },
		{ hex: '#7D8CA3', name: 'Dusty blue' },
		{ hex: '#A8756C', name: 'Terracotta' },
		{ hex: '#6E7F6B', name: 'Deep olive' },
		{ hex: '#9C7B94', name: 'Mauve' }
	];

	/**
	 * Text colours, all dark enough to read on the cream page.
	 *
	 * Deliberately not "any colour you like" as the first thing offered: text is the
	 * one element on the site where a bad contrast choice makes the page unusable
	 * rather than merely ugly. The custom picker is still there underneath.
	 */
	const inkSwatches = [
		{ hex: '#1A1A1A', name: 'Near black' },
		{ hex: '#2F2A24', name: 'Warm charcoal' },
		{ hex: '#3B342B', name: 'Espresso' },
		{ hex: '#26343F', name: 'Ink blue' },
		{ hex: '#333B31', name: 'Forest' },
		{ hex: '#42303A', name: 'Plum' }
	];

	/**
	 * Roughly what the browser will compute for this colour on the cream page.
	 *
	 * A full WCAG contrast ratio would be more precise, but the useful signal here is
	 * binary -- "this is too pale to read" -- and a warning that appears at the right
	 * moment beats a number nobody wants to interpret.
	 */
	const inkTooPale = $derived.by(() => {
		const hex = ink.trim().replace(/^#/, '');
		const full =
			hex.length === 3
				? hex
						.split('')
						.map((char) => char + char)
						.join('')
				: hex;
		if (!/^[0-9a-f]{6}$/i.test(full)) return false;

		const value = Number.parseInt(full, 16);
		const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
		return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
	});

	const fontSamples = {
		'serif-sans': { display: 'Cormorant Garamond, Georgia, serif', body: 'Inter, sans-serif' },
		'sans-sans': { display: 'Inter, sans-serif', body: 'Inter, sans-serif' },
		'serif-serif': { display: 'Cormorant Garamond, Georgia, serif', body: 'Georgia, serif' }
	} as const;
</script>

<ContentNav siteUrl={data.siteUrl} />
<Flash {form} />

<div class="mt-5 grid gap-4 lg:grid-cols-2">
	<form method="POST" action="?/saveTheme" class="card space-y-5 p-5">
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
		<h2 class="text-sm font-semibold text-ink">Appearance</h2>

		<div>
			<span class="label">Accent colour</span>
			<div class="flex flex-wrap gap-2">
				{#each swatches as swatch (swatch.hex)}
					<button
						type="button"
						class="h-10 w-10 rounded-full border-2 transition-transform hover:scale-105"
						class:border-ink={accent.toLowerCase() === swatch.hex.toLowerCase()}
						class:border-line={accent.toLowerCase() !== swatch.hex.toLowerCase()}
						style="background: {swatch.hex}"
						title={swatch.name}
						aria-label={swatch.name}
						onclick={() => (accent = swatch.hex)}
					></button>
				{/each}
			</div>

			<div class="mt-3 flex items-center gap-2">
				<input
					type="color"
					class="h-11 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
					bind:value={accent}
					aria-label="Custom accent colour"
				/>
				<input name="accent" class="field font-mono" bind:value={accent} maxlength="7" />
			</div>
			<p class="mt-1 text-xs text-muted">
				Used for buttons, links and the RSVP page. It is lightened automatically for
				guests whose phone is in dark mode.
			</p>
		</div>

		<div>
			<span class="label">Text colour</span>
			<div class="flex flex-wrap gap-2">
				{#each inkSwatches as swatch (swatch.hex)}
					<button
						type="button"
						class="h-10 w-10 rounded-full border-2 transition-transform hover:scale-105"
						class:border-ink={ink.toLowerCase() === swatch.hex.toLowerCase()}
						class:border-line={ink.toLowerCase() !== swatch.hex.toLowerCase()}
						style="background: {swatch.hex}"
						title={swatch.name}
						aria-label={swatch.name}
						onclick={() => (ink = swatch.hex)}
					></button>
				{/each}
			</div>

			<div class="mt-3 flex items-center gap-2">
				<input
					type="color"
					class="h-11 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
					bind:value={ink}
					aria-label="Custom text colour"
				/>
				<input name="ink" class="field font-mono" bind:value={ink} maxlength="7" />
			</div>

			<!-- Previewed on the guest site's own page colour, not the admin's, or the
			     sample would be reassuring about the wrong background. -->
			<p
				class="mt-2 rounded-lg border border-line px-3 py-2 text-sm"
				style="background:#FBFAF7; color:{ink}"
			>
				Andrew &amp; Madeline are getting married.
			</p>

			{#if inkTooPale}
				<p class="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
					That is very pale for body text on a cream page. It will be hard to read.
				</p>
			{/if}

			<p class="mt-1 text-xs text-muted">
				Headings and body text. Captions follow it. In dark mode it is lifted until it
				reads on the dark background, keeping the colour you chose.
			</p>
		</div>

		<div>
			<span class="label">Lettering</span>
			<div class="space-y-2">
				{#each Object.entries(fontSamples) as [key, sample] (key)}
					<label
						class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5"
						class:border-accent={fonts === key}
						class:bg-accent-soft={fonts === key}
						class:border-line={fonts !== key}
					>
						<input type="radio" name="fonts" value={key} bind:group={fonts} class="accent-accent" />
						<span>
							<span class="block text-lg text-ink" style="font-family: {sample.display}">
								Andrew &amp; Madeline
							</span>
							<span class="block text-xs text-muted" style="font-family: {sample.body}">
								Saturday, May 29 &middot; The Old Barn
							</span>
						</span>
					</label>
				{/each}
			</div>
		</div>

		<div>
			<label class="label" for="hero">Home page hero</label>
			<select id="hero" name="hero" class="field" value={data.theme.hero}>
				<option value="photo">Photo behind the names</option>
				<option value="tint">Photo, heavily tinted</option>
				<option value="plain">No photo</option>
			</select>
		</div>

		<div>
			<span class="label">Section order</span>
			<p class="-mt-1 mb-2 text-xs text-muted">
				The order guests see in the navigation. Switch sections on and off under
				<a class="text-accent hover:underline" href="/content">Home &amp; sections</a>.
			</p>

			<ul class="divide-y divide-line rounded-lg border border-line">
				{#each order as key, index (key)}
					<li class="flex items-center gap-2 px-3 py-2">
						<input type="hidden" name="order" value={key} />
						<span class="text-sm" class:text-ink={enabled(key)} class:text-muted={!enabled(key)}>
							{labelFor(key)}
						</span>
						{#if !enabled(key)}
							<span class="pill-muted">Hidden</span>
						{/if}
						<span class="ml-auto flex gap-1">
							<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, -1)} aria-label="Move {labelFor(key)} up">
								&uarr;
							</button>
							<button type="button" class="btn-ghost btn-sm" onclick={() => move(index, 1)} aria-label="Move {labelFor(key)} down">
								&darr;
							</button>
						</span>
					</li>
				{/each}
			</ul>
		</div>

		<button type="submit" class="btn-primary">Save appearance</button>
	</form>

	<form method="POST" action="?/saveWording" class="card space-y-4 p-5">
		<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
		<h2 class="text-sm font-semibold text-ink">Wording</h2>
		<p class="-mt-2 text-xs text-muted">
			Every phrase the site says that is not part of a section's own content.
		</p>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class="label" for="rsvpButton">RSVP button</label>
				<input id="rsvpButton" name="rsvpButton" class="field" value={data.wording.rsvpButton} />
			</div>
			<div>
				<label class="label" for="detailsButton">Details button</label>
				<input id="detailsButton" name="detailsButton" class="field" value={data.wording.detailsButton} />
			</div>
			<div class="sm:col-span-2">
				<label class="label" for="footerNote">Footer note</label>
				<input id="footerNote" name="footerNote" class="field" value={data.wording.footerNote} />
			</div>
		</div>

		<h3 class="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">The RSVP page</h3>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class="label" for="rsvpHeading">Page title</label>
				<input id="rsvpHeading" name="rsvpHeading" class="field" value={data.wording.rsvpHeading} />
			</div>
			<div>
				<label class="label" for="rsvpIntro">Line under the name</label>
				<input
					id="rsvpIntro"
					name="rsvpIntro"
					class="field"
					placeholder="Optional"
					value={data.wording.rsvpIntro}
				/>
			</div>
			<div>
				<label class="label" for="rsvpAcceptLabel">Accept button</label>
				<input id="rsvpAcceptLabel" name="rsvpAcceptLabel" class="field" value={data.wording.rsvpAcceptLabel} />
			</div>
			<div>
				<label class="label" for="rsvpDeclineLabel">Decline button</label>
				<input id="rsvpDeclineLabel" name="rsvpDeclineLabel" class="field" value={data.wording.rsvpDeclineLabel} />
			</div>
			<div class="sm:col-span-2">
				<label class="label" for="rsvpCountQuestion">The count question</label>
				<input id="rsvpCountQuestion" name="rsvpCountQuestion" class="field" value={data.wording.rsvpCountQuestion} />
			</div>
			<div>
				<label class="label" for="rsvpSubmitLabel">Send button</label>
				<input id="rsvpSubmitLabel" name="rsvpSubmitLabel" class="field" value={data.wording.rsvpSubmitLabel} />
			</div>
			<div>
				<label class="label" for="rsvpUpdateLabel">Update button</label>
				<input id="rsvpUpdateLabel" name="rsvpUpdateLabel" class="field" value={data.wording.rsvpUpdateLabel} />
			</div>
		</div>

		<h3 class="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">After they reply</h3>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class="label" for="thanksAttendingHeading">Coming — heading</label>
				<input id="thanksAttendingHeading" name="thanksAttendingHeading" class="field" value={data.wording.thanksAttendingHeading} />
			</div>
			<div>
				<label class="label" for="thanksAttendingBody">Coming — message</label>
				<input id="thanksAttendingBody" name="thanksAttendingBody" class="field" value={data.wording.thanksAttendingBody} />
			</div>
			<div>
				<label class="label" for="thanksDecliningHeading">Not coming — heading</label>
				<input id="thanksDecliningHeading" name="thanksDecliningHeading" class="field" value={data.wording.thanksDecliningHeading} />
			</div>
			<div>
				<label class="label" for="thanksDecliningBody">Not coming — message</label>
				<input id="thanksDecliningBody" name="thanksDecliningBody" class="field" value={data.wording.thanksDecliningBody} />
			</div>
		</div>

		<button type="submit" class="btn-primary">Save wording</button>
	</form>
</div>
