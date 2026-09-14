<script lang="ts">
	import { untrack } from 'svelte';
	import ContentNav from '$lib/components/ContentNav.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { CSRF_FIELD } from '$shared/csrf-fields';
	import type { PartyMember } from '$shared/types';
	import type { ActionData, PageData } from './$types';
	import { downscale } from '$lib/actions/downscale';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// A working copy, seeded once from the loaded content and then owned by this
	// form until it is saved. `untrack` marks that one-time read as deliberate.
	let members = $state<PartyMember[]>(untrack(() => structuredClone(data.party.members)));

	function add() {
		members = [
			...members,
			{
				id: `member-new-${members.length}-${Date.now()}`,
				name: '',
				role: '',
				// Copied from the person above, because a group is typed once and then
				// repeated for everyone in it.
				group: members.at(-1)?.group ?? '',
				bio: '',
				imageId: null
			}
		];
	}

	function remove(index: number) {
		members = members.filter((_, position) => position !== index);
	}

	// Offered as suggestions under every group field. Typing "Bridesmaid" where the
	// others say "Bridesmaids" would quietly make a third block on the site, and this
	// is the cheapest way to stop that.
	const groupNames = $derived([
		...new Set(members.map((member) => member.group.trim()).filter(Boolean))
	]);

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= members.length) return;
		const next = [...members];
		[next[index], next[target]] = [next[target], next[index]];
		members = next;
	}
</script>

<ContentNav siteUrl={data.siteUrl} />
<Flash {form} />

<form method="POST" action="?/save" enctype="multipart/form-data" class="mt-5 space-y-4">
	<input type="hidden" name={CSRF_FIELD} value={data.csrfToken} />
	<input type="hidden" name="member_count" value={members.length} />

	<section class="card grid gap-4 p-5 sm:grid-cols-2">
		<div>
			<label class="label" for="heading">Page heading</label>
			<input id="heading" name="heading" class="field" value={data.party.heading} />
		</div>
		<div>
			<label class="label" for="intro">Intro line</label>
			<input id="intro" name="intro" class="field" value={data.party.intro} />
		</div>
	</section>

	<section class="card p-5">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold text-ink">The party</h2>
			<button type="button" class="btn-secondary btn-sm" onclick={add}>Add someone</button>
		</div>

		{#if members.length === 0}
			<p class="mt-4 text-sm text-muted">Nobody added yet.</p>
		{/if}

		<p class="mt-1 text-xs text-muted">
			They appear on the site in this order. Use Up and Down to rearrange them, then save.
		</p>
		<p class="mt-1 text-xs text-muted">
			Give people the same group -- Bridesmaids, Groomsmen -- and the site shows each group
			as its own block, two across. Leave every group empty and the whole party is shown
			together, four across.
		</p>

		<datalist id="party-groups">
			{#each groupNames as name (name)}
				<option value={name}></option>
			{/each}
		</datalist>

		<!--
			One column, not two. The order is the point of this list, and in a two-column
			grid "up" moves a card left rather than up -- which is what made the buttons
			read as broken.
		-->
		<ul class="mt-4 space-y-4">
			{#each members as member, index (member.id)}
				<li class="rounded-xl border border-line p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<span class="text-xs font-semibold uppercase tracking-wide text-muted">
							#{index + 1}{member.name ? ` · ${member.name}` : ''}
						</span>
						<div class="flex flex-wrap gap-1">
							<!-- Disabled at the ends, so the list says where it stops rather than
							     silently ignoring a press. -->
							<button
								type="button"
								class="btn-secondary btn-sm"
								disabled={index === 0}
								onclick={() => move(index, -1)}
							>
								&uarr; Up
							</button>
							<button
								type="button"
								class="btn-secondary btn-sm"
								disabled={index === members.length - 1}
								onclick={() => move(index, 1)}
							>
								&darr; Down
							</button>
							<button type="button" class="btn-ghost btn-sm text-bad" onclick={() => remove(index)}>
								Remove
							</button>
						</div>
					</div>

					<input type="hidden" name="member_{index}_id" value={member.id} />

					<!-- Two columns inside the card, so one column of cards does not make the
					     page twice as long as it was. -->
					<div class="mt-3 grid gap-3 sm:grid-cols-2">
						<div>
							<label class="label" for="member_{index}_name">Name</label>
							<input
								id="member_{index}_name"
								name="member_{index}_name"
								class="field"
								value={member.name}
							/>
						</div>
						<div>
							<label class="label" for="member_{index}_role">Role</label>
							<input
								id="member_{index}_role"
								name="member_{index}_role"
								class="field"
								placeholder="Maid of Honour"
								value={member.role}
							/>
						</div>
						<div>
							<label class="label" for="member_{index}_group">Group</label>
							<input
								id="member_{index}_group"
								name="member_{index}_group"
								class="field"
								list="party-groups"
								placeholder="Bridesmaids"
								bind:value={members[index].group}
							/>
						</div>
						<div>
							<label class="label" for="member_{index}_image">Photo</label>
							{#if member.imageId}
								<img
									src="/images/{member.imageId}"
									alt=""
									class="mb-2 h-28 w-24 rounded-lg border border-line object-cover"
								/>
								<label class="mb-2 flex items-center gap-2 text-sm text-muted">
									<input type="checkbox" name="member_{index}_removeImage" value="1" class="accent-accent" />
									Remove this photo
								</label>
							{/if}
							<input
								id="member_{index}_image"
								name="member_{index}_image"
								type="file"
								accept="image/*"
								use:downscale
								class="field"
							/>
						</div>
						<div class="sm:col-span-2">
							<label class="label" for="member_{index}_bio">Short bio</label>
							<textarea id="member_{index}_bio" name="member_{index}_bio" class="field" rows="3"
								>{member.bio}</textarea>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<button type="submit" class="btn-primary">Save wedding party</button>
</form>
