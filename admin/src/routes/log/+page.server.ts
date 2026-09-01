import type { PageServerLoad } from './$types';
import { countActivity, listActivity, listHouseholds } from '$shared/db';
import { EVENT_LABELS } from '$lib/event-labels';
import type { ActivityEventType } from '$shared/types';

const PAGE_SIZE = 60;

export const load: PageServerLoad = ({ url }) => {
	const typeParam = url.searchParams.get('type') ?? 'all';
	const eventType = (typeParam in EVENT_LABELS ? typeParam : 'all') as ActivityEventType | 'all';

	const householdId = url.searchParams.get('household') ?? '';
	const search = url.searchParams.get('q') ?? '';
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';

	const query = {
		eventType,
		householdId: householdId || undefined,
		search: search || undefined,
		// The stored timestamps are full ISO strings, so a bare date needs widening to
		// the whole day or "to = today" would exclude everything logged today.
		from: from ? `${from}T00:00:00.000Z` : undefined,
		to: to ? `${to}T23:59:59.999Z` : undefined
	};

	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const total = countActivity(query);

	return {
		entries: listActivity({ ...query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
		total,
		page,
		pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		types: Object.entries(EVENT_LABELS).map(([value, label]) => ({ value, label })),
		households: listHouseholds({ sort: 'name' }).map((household) => ({
			id: household.id,
			name: household.name
		})),
		filters: { type: typeParam, household: householdId, search, from, to }
	};
};
