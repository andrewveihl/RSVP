import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure, selectedIds } from '$lib/server/guard';
import {
	countHouseholds,
	createHousehold,
	deleteHousehold,
	deleteHouseholds,
	getHousehold,
	findHouseholdByName,
	listBatches,
	listSides,
	listHouseholds,
	logActivity,
	markInvitationSent,
	updateHousehold,
	type HouseholdSort
} from '$shared/db';
import { clampInteger, normaliseEmail, optionalText, requireText } from '$shared/sanitize';
import type { RsvpStatus } from '$shared/types';

const PAGE_SIZE = 50;

const SORTS: HouseholdSort[] = [
	'name',
	'email',
	'party_size',
	'status',
	'plus_ones',
	'invitation_sent',
	'updated_at'
];

export const load: PageServerLoad = ({ url }) => {
	const search = url.searchParams.get('q') ?? '';
	const statusParam = url.searchParams.get('status') ?? 'all';
	// The query string is untrusted, so it is narrowed to a known value rather than
	// passed through -- which is also what keeps the ORDER BY and WHERE builders safe.
	const status: RsvpStatus | 'all' = (['attending', 'declined', 'pending'] as const).includes(
		statusParam as RsvpStatus
	)
		? (statusParam as RsvpStatus)
		: 'all';

	const invitationParam = url.searchParams.get('invitation') ?? 'all';
	const invitationSent: boolean | 'all' =
		invitationParam === 'sent' ? true : invitationParam === 'unsent' ? false : 'all';

	// Only a value from the known list can reach the query builder's ORDER BY.
	const sortParam = url.searchParams.get('sort') as HouseholdSort | null;
	const sort: HouseholdSort = sortParam && SORTS.includes(sortParam) ? sortParam : 'name';
	const direction = url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';

	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const batch = url.searchParams.get('batch') ?? '';
	const side = url.searchParams.get('side') ?? '';

	const filters = {
		search,
		status,
		invitationSent,
		batch: batch || undefined,
		side: side || undefined,
		sort,
		direction: direction as 'asc' | 'desc'
	};

	const total = countHouseholds(filters);

	return {
		households: listHouseholds({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
		total,
		page,
		pageSize: PAGE_SIZE,
		pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		batches: listBatches(),
		sides: listSides(),
		filters: { search, status: statusParam, invitation: invitationParam, batch, side, sort, direction }
	};
};

/**
 * The per-household extra-guest cap, as the form submits it.
 *
 * An empty field means "no limit" and has to survive as null: 0 is a different answer
 * entirely -- it forbids every plus-one. A number outside the range is clamped rather
 * than dropped, so a mistyped 200 cannot quietly turn a cap into no cap at all.
 */
function readExtraCap(value: FormDataEntryValue | null): number | null {
	const raw = value?.toString().trim() ?? '';
	if (raw === '') return null;
	return clampInteger(raw, 0, 20, 0);
}

/** The household fields a form submits, normalised once for both create and update. */
function readHousehold(form: FormData) {
	return {
		name: requireText(form.get('name'), 200),
		email: normaliseEmail(form.get('email')),
		phone: optionalText(form.get('phone'), { max: 60 }),
		mailingAddress: optionalText(form.get('mailingAddress'), { multiline: true, max: 500 }),
		partySize: clampInteger(form.get('partySize'), 1, 50, 1),
		maxExtraGuests: readExtraCap(form.get('maxExtraGuests')),
		batch: optionalText(form.get('batch'), { max: 80 }),
		side: optionalText(form.get('side'), { max: 80 }),
		notes: optionalText(form.get('notes'), { multiline: true, max: 2000 })
	};
}

export const actions: Actions = {
	create: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const input = readHousehold(result.form);
		if (!input.name) return fail(400, { error: 'A household name is required.' });

		// A warning rather than a block: two branches of a family really can share a
		// name, and the admin is better placed than we are to judge.
		const duplicate = findHouseholdByName(input.name);

		const household = createHousehold({ ...input, name: input.name });
		logActivity({
			eventType: 'guest_added',
			description: `Added ${household.name}`,
			householdId: household.id,
			metadata: { partySize: household.partySize },
			ipAddress: event.locals.clientIp
		});

		return {
			success: `Added ${household.name}.`,
			warning: duplicate ? `Note: "${input.name}" already existed on the list.` : undefined
		};
	},

	update: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const id = result.form.get('id')?.toString() ?? '';
		const existing = getHousehold(id);
		if (!existing) return fail(404, { error: 'That household no longer exists.' });

		const input = readHousehold(result.form);
		if (!input.name) return fail(400, { error: 'A household name is required.' });

		const household = updateHousehold(id, { ...input, name: input.name });
		logActivity({
			eventType: 'guest_edited',
			description: `Edited ${household?.name ?? existing.name}`,
			householdId: id,
			ipAddress: event.locals.clientIp
		});

		return { success: `Saved ${household?.name ?? existing.name}.` };
	},

	delete: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const id = result.form.get('id')?.toString() ?? '';
		const existing = getHousehold(id);
		if (!existing) return fail(404, { error: 'That household no longer exists.' });

		deleteHousehold(id);
		// Logged after the delete, with the household reference already gone (the
		// foreign key is ON DELETE SET NULL), so the name is preserved in the text.
		logActivity({
			eventType: 'guest_deleted',
			description: `Deleted ${existing.name}`,
			metadata: { name: existing.name },
			ipAddress: event.locals.clientIp
		});

		return { success: `Deleted ${existing.name}.` };
	},

	bulkDelete: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const ids = selectedIds(result.form);
		if (ids.length === 0) return fail(400, { error: 'Select at least one household first.' });

		const removed = deleteHouseholds(ids);
		logActivity({
			eventType: 'guest_deleted',
			description: `Deleted ${removed} household(s)`,
			metadata: { count: removed },
			ipAddress: event.locals.clientIp
		});

		return { success: `Deleted ${removed} household(s).` };
	},

	bulkInvitation: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const ids = selectedIds(result.form);
		if (ids.length === 0) return fail(400, { error: 'Select at least one household first.' });

		const sent = result.form.get('sent') === '1';
		const changed = markInvitationSent(ids, sent);
		logActivity({
			eventType: 'guest_edited',
			description: `Marked ${changed} invitation(s) as ${sent ? 'sent' : 'not sent'}`,
			metadata: { count: changed, sent },
			ipAddress: event.locals.clientIp
		});

		return { success: `Marked ${changed} invitation(s) as ${sent ? 'sent' : 'not sent'}.` };
	}
};
