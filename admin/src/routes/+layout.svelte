<script lang="ts">
	import '../app.css';
	import AdminNav from '$lib/components/AdminNav.svelte';
	import IdleLogout from '$lib/components/IdleLogout.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	<title>Admin &middot; {data.coupleNames || 'Wedding RSVP'}</title>
</svelte:head>

{#if data.admin}
	<AdminNav csrfToken={data.csrfToken} coupleNames={data.coupleNames} />
	<IdleLogout csrfToken={data.csrfToken} timeoutMs={data.sessionTtlMs} />
{/if}

<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
	{@render children()}
</main>
