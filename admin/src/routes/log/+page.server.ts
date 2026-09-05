import type { PageServerLoad } from './$types';
import { countActivity, listActivity, listHouseholds } from '$shared/db';
import { EVENT_LABELS } from '$lib/event-labels';
import type { ActivityEventType } from '$shared/types';

const PAGE_SIZE = 60;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The two edges of a filtered day, as the UTC instants the log rows are compared
 * against.
 *
 * A date typed into the filter means a day where the wedding is, not a day in UTC. The
 * timestamps are stored as UTC ISO strings, so appending a literal `Z` -- as this used
 * to -- shifted the window by the server's offset: "from today" in Chicago also swept
 * in everything from six o'clock the previous evening. Parsing the edges as local time
 * and converting puts the boundary where the admin drew it.
 *
 * An unparseable value returns undefined, which drops the bound entirely rather than
 * filtering against `Invalid Date`.
 */
function dayEdge(date: string, time: string): string | undefined {
	if (!DATE_ONLY.test(date)) return undefined;
	const parsed = new Date(`${date}T${time}`);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

const dayStart = (date: string) => dayEdge(date, '00:00:00.000');
const dayEnd = (date: string) => dayEdge(date, '23:59:59.999');

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
		from: dayStart(from),
		to: dayEnd(to)
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
