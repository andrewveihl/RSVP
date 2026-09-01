/**
 * Human wording for each audit-log event type.
 *
 * In its own module rather than exported from `+page.server.ts`: SvelteKit only
 * permits its own known exports (`load`, `actions`, ...) from a route file, and would
 * refuse to build otherwise.
 */
import type { ActivityEventType } from '$shared/types';

export const EVENT_LABELS: Record<ActivityEventType, string> = {
	rsvp_submitted: 'RSVP submitted',
	rsvp_updated: 'RSVP updated',
	guest_added: 'Guest added',
	guest_edited: 'Guest edited',
	guest_deleted: 'Guest deleted',
	reminder_sent: 'Reminder sent',
	csv_imported: 'CSV imported',
	invitation_generated: 'Invitations generated',
	settings_changed: 'Settings changed',
	content_changed: 'Website edited',
	backup_created: 'Backup created',
	backup_restored: 'Backup restored',
	admin_login: 'Admin signed in'
};
