<script lang="ts">
	/**
	 * Admin navigation.
	 *
	 * There are fourteen screens and two users, so this is a plain wrapping row rather
	 * than a collapsing sidebar: everything is one tap away on a phone and nothing is
	 * hidden behind a menu the couple would have to learn.
	 */
	import { page } from '$app/state';
	import { CSRF_FIELD } from '$shared/csrf-fields';

	let { csrfToken, coupleNames }: { csrfToken: string; coupleNames: string } = $props();

	const groups = [
		[
			{ href: '/dashboard', label: 'Dashboard' },
			{ href: '/guests', label: 'Guests' },
			{ href: '/rsvps', label: 'RSVPs' },
			{ href: '/analytics', label: 'Analytics' }
		],
		[
			{ href: '/invitations', label: 'Invitations' },
			{ href: '/labels', label: 'Labels' },
			{ href: '/qr', label: 'QR codes' },
			{ href: '/emails', label: 'Emails' }
		],
		[
			{ href: '/content', label: 'Website' },
			{ href: '/log', label: 'Activity' },
			{ href: '/backups', label: 'Backups' },
			{ href: '/settings', label: 'Settings' }
		]
	];

	const isCurrent = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<header class="border-b border-line bg-surface">
	<div class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
		<a href="/dashboard" class="font-display text-lg tracking-wide text-ink">
			{coupleNames || 'Wedding admin'}
		</a>

		<nav class="flex flex-wrap items-center gap-x-5 gap-y-1" aria-label="Admin">
			{#each groups as group, index (index)}
				{#if index > 0}
					<span class="hidden h-4 w-px bg-line sm:block" aria-hidden="true"></span>
				{/if}
				{#each group as link (link.href)}
					<a
						href={link.href}
						class="py-2 text-sm transition-colors hover:text-accent"
						class:text-accent={isCurrent(link.href)}
						class:text-muted={!isCurrent(link.href)}
						aria-current={isCurrent(link.href) ? 'page' : undefined}
					>
						{link.label}
					</a>
				{/each}
			{/each}
		</nav>

		<form method="POST" action="/?/logout" class="ml-auto">
			<input type="hidden" name={CSRF_FIELD} value={csrfToken} />
			<button type="submit" class="text-sm text-muted hover:text-ink" data-testid="admin-logout">
				Log out
			</button>
		</form>
	</div>
</header>
