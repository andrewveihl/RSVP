<script lang="ts">
	/**
	 * The RSVP status badge.
	 *
	 * Status is never colour alone: each pill carries its word, so the three states are
	 * distinguishable in greyscale, under any colour-vision deficiency, and in a
	 * printed export.
	 */
	import type { RsvpStatus } from '$shared/types';

	let { status }: { status: RsvpStatus } = $props();

	const config = $derived({
		attending: { className: 'pill-ok', text: 'Attending' },
		declined: { className: 'pill-bad', text: 'Declined' },
		pending: { className: 'pill-muted', text: 'Pending' }
	}[status]);
</script>

<span class={config.className}>{config.text}</span>
