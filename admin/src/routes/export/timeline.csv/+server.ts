import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { responseTimeline } from '$shared/db';
import { toCsv } from '$shared/csv';

/**
 * The response timeline as data.
 *
 * The chart on the analytics page is the summary; this is the same numbers in a form
 * that can be pasted into a spreadsheet -- which is also what makes the chart's values
 * reachable without hovering it.
 */
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.admin) error(401, 'Not signed in.');

	const rows = responseTimeline().map((point) => [
		point.date,
		point.responses,
		point.attending,
		point.declined,
		point.cumulative
	]);

	return new Response(
		toCsv(['Date', 'Responses', 'Attending', 'Declined', 'Cumulative'], rows),
		{
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': 'attachment; filename="rsvp-timeline.csv"',
				'cache-control': 'no-store'
			}
		}
	);
};
