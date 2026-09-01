<script lang="ts">
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let size = $state('1024');
	let level = $state('M');
	let filter = $state('');

	const query = $derived(`?size=${size}&level=${level}`);

	const visible = $derived(
		filter.trim()
			? data.households.filter((household) =>
					household.name.toLowerCase().includes(filter.trim().toLowerCase())
				)
			: data.households
	);
</script>

<div>
	<h1 class="font-display text-2xl text-ink">QR codes</h1>
	<p class="mt-1 text-sm text-muted">
		One per household, plus a universal code for signage and anyone who lost their link.
	</p>
</div>

<div class="mt-5 grid gap-4 lg:grid-cols-[20rem_1fr]">
	<section class="card h-fit p-5">
		<h2 class="text-sm font-semibold text-ink">Universal code</h2>
		<p class="mt-1 text-xs text-muted">Opens the find-my-invitation page.</p>

		<img
			src={data.universalQr}
			alt="Universal RSVP QR code"
			class="mt-4 w-full rounded-lg border border-line bg-white"
		/>
		<p class="mt-3 break-all rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{data.universal}</p>

		<div class="mt-3 flex gap-2">
			<a href="/qr/universal.png{query}" class="btn-secondary btn-sm" download>PNG</a>
			<a href="/qr/universal.svg{query}" class="btn-secondary btn-sm" download>SVG</a>
		</div>

		<div class="mt-5 space-y-3 border-t border-line pt-4">
			<div>
				<label class="label" for="size">PNG size</label>
				<select id="size" class="field" bind:value={size}>
					<option value="512">512 px</option>
					<option value="1024">1024 px</option>
					<option value="2048">2048 px -- large print</option>
				</select>
			</div>
			<div>
				<label class="label" for="level">Error correction</label>
				<select id="level" class="field" bind:value={level}>
					<option value="L">L -- smallest symbol</option>
					<option value="M">M -- recommended</option>
					<option value="Q">Q</option>
					<option value="H">H -- survives damage</option>
				</select>
				<p class="mt-1 text-xs text-muted">
					Higher correction spends more of the symbol on redundancy, so the squares get
					smaller at the same printed size. M is the right trade for a card indoors.
				</p>
			</div>
		</div>
	</section>

	<section class="card p-5">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 class="text-sm font-semibold text-ink">Per household</h2>
				<p class="text-xs text-muted">Each links straight to that household's RSVP.</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<input class="field w-44" placeholder="Filter by name" bind:value={filter} aria-label="Filter" />
				<form method="POST" action="/invitations/download">
					<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
					<input type="hidden" name="format" value="zip-png" />
					<button type="submit" class="btn-secondary btn-sm">Download all as ZIP</button>
				</form>
			</div>
		</div>

		<ul class="mt-4 divide-y divide-line rounded-lg border border-line">
			{#each visible as household (household.id)}
				<li class="flex items-center gap-3 px-3 py-2.5 text-sm">
					<a class="text-ink hover:text-accent" href="/guests/{household.id}">{household.name}</a>
					<span class="ml-auto flex gap-2">
						<a href="/qr/{household.id}.png{query}" class="btn-ghost btn-sm" download>PNG</a>
						<a href="/qr/{household.id}.svg{query}" class="btn-ghost btn-sm" download>SVG</a>
					</span>
				</li>
			{:else}
				<li class="px-3 py-6 text-center text-sm text-muted">No households match.</li>
			{/each}
		</ul>
	</section>
</div>
