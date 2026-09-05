<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import SiteNav from '$lib/components/SiteNav.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import { themeStyleTag } from '$shared/theme';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	/**
	 * The RSVP pages get no site chrome *on a phone*.
	 *
	 * Measured rather than assumed: on a Pixel 5 the nav and footer together took 242px
	 * of a 727px viewport, which pushed the submit button below the fold on the one page
	 * whose entire job is a single question.
	 *
	 * A desktop has that space many times over, and stripping the chrome there bought
	 * nothing while costing everything: the page became a dead end, with no way through
	 * to the rest of the site for a guest who followed their link straight to it. So the
	 * chrome comes back at `sm`, where it is free.
	 *
	 * This is a branch here rather than a `+layout@.svelte` reset, because that reset
	 * targets the *root* layout -- it makes a route a child of this file rather than
	 * escaping it, so the nav and footer would still render.
	 */
	const bare = $derived(page.url.pathname.startsWith('/rsvp'));
</script>

<svelte:head>
	<title>{data.site.coupleNames}</title>
	{#if data.themeCss}
		<!-- Custom-property overrides only; see themeStyleTag for why it is built
		     rather than written as a literal tag. -->
		{@html themeStyleTag(data.themeCss)}
	{/if}
	<meta
		name="description"
		content="{data.site.coupleNames} are getting married{data.site.weddingDateLabel
			? ` on ${data.site.weddingDateLabel}`
			: ''}."
	/>
</svelte:head>

{#if bare}
	<!--
		`contents` rather than `block` on these two wrappers: the header is `sticky` and
		the footer relies on `mt-auto`, and both need the body's flex column as their
		parent. A wrapper that laid out normally would become the header's containing
		block and quietly stop it sticking to anything.
	-->
	<div class="hidden sm:contents">
		<SiteNav coupleNames={data.site.coupleNames} links={data.site.nav} />
	</div>

	<!--
		`dvh` rather than `vh`: on mobile Safari and Chrome the toolbar shrinks the visible
		area and `100vh` is the *larger* measurement, so a pinned button would sit under
		the browser chrome exactly when the keyboard is open. On a desktop the chrome
		above and below is doing that job, so this just takes what is left.

		Deliberately not `justify-center`. With `flex-1` and `min-h-0` this box is exactly
		the space left between the header and the footer, so on a short window a taller
		card would be centred *past* the top edge -- and overflow above the viewport is
		not somewhere a scrollbar can reach. Top-aligned with a margin cannot do that.
	-->
	<div class="flex min-h-[100dvh] flex-col sm:min-h-0 sm:flex-1">
		{@render children()}

		<!-- The phone's stand-in for the footer, and only that. -->
		<footer class="px-5 pb-5 pt-2 text-center sm:hidden">
			<a href="/" class="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
				{data.site.coupleNames}
			</a>
		</footer>
	</div>

	<div class="hidden sm:contents">
		<SiteFooter
			coupleNames={data.site.coupleNames}
			weddingDateLabel={data.site.weddingDateLabel}
			contactEmail={data.site.contactEmail}
			note={data.site.content.wording.footerNote}
		/>
	</div>
{:else}
	<SiteNav coupleNames={data.site.coupleNames} links={data.site.nav} />

	{#if data.site.content.announcement}
		<p class="bg-accent-soft px-5 py-3 text-center text-sm text-ink">
			{data.site.content.announcement}
		</p>
	{/if}

	<main class="flex-1">
		{@render children()}
	</main>

	<SiteFooter
		coupleNames={data.site.coupleNames}
		weddingDateLabel={data.site.weddingDateLabel}
		contactEmail={data.site.contactEmail}
		note={data.site.content.wording.footerNote}
	/>
{/if}
