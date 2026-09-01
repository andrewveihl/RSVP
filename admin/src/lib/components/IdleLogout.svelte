<script lang="ts">
	/**
	 * Signs the admin out after a period of inactivity.
	 *
	 * The session cookie already expires on its own -- that is what actually enforces
	 * the timeout, and it holds whether this component runs or not. What this adds is
	 * the visible half: without it an idle tab sits there looking signed in until the
	 * next click returns a redirect, which is exactly the moment somebody is least
	 * expecting to lose what they typed.
	 *
	 * The warning appears a minute out, so an admin mid-edit can keep the session alive
	 * by moving the mouse rather than losing the form.
	 */
	import { CSRF_FIELD } from '$shared/csrf-fields';

	let { csrfToken, timeoutMs = 30 * 60 * 1000 }: { csrfToken: string; timeoutMs?: number } =
		$props();

	const WARN_BEFORE_MS = 60_000;

	let idleFor = $state(0);
	let form = $state<HTMLFormElement | null>(null);

	const warning = $derived(idleFor >= timeoutMs - WARN_BEFORE_MS && idleFor < timeoutMs);
	const secondsLeft = $derived(Math.max(0, Math.ceil((timeoutMs - idleFor) / 1000)));

	$effect(() => {
		const reset = () => {
			idleFor = 0;
		};

		const events = ['pointerdown', 'keydown', 'scroll', 'focus'] as const;
		for (const name of events) window.addEventListener(name, reset, { passive: true });

		const tick = setInterval(() => {
			idleFor += 1000;
			if (idleFor >= timeoutMs) form?.requestSubmit();
		}, 1000);

		return () => {
			clearInterval(tick);
			for (const name of events) window.removeEventListener(name, reset);
		};
	});
</script>

<form method="POST" action="/?/logout" bind:this={form} class="hidden">
	<input type="hidden" name={CSRF_FIELD} value={csrfToken} />
</form>

{#if warning}
	<div
		class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-warn/40 bg-warn/12 px-5 py-2.5 text-sm text-warn shadow-lift"
		role="status"
	>
		Signing you out in {secondsLeft}s -- move the mouse to stay.
	</div>
{/if}
