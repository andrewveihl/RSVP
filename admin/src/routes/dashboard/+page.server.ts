import type { PageServerLoad } from './$types';
import {
	getDashboardStats,
	listActivity,
	responseTimeline,
	batchBreakdown,
	reminderEffectiveness,
	dailyActivity
} from '$shared/db';
import { getConfig, isRsvpClosed, rsvpDeadlineDate } from '$shared/config';
import { formatLongDate, countdownTo } from '$shared/format';
import { getSetting } from '$shared/db';

export const load: PageServerLoad = () => {
	const deadline = rsvpDeadlineDate(getSetting('rsvp_deadline'));
	const weddingDate = new Date(`${getSetting('wedding_date')}T00:00:00`);

	return {
		stats: getDashboardStats(),
		timeline: responseTimeline(),
		activity: dailyActivity(30),
		recent: listActivity({ limit: 20 }),
		batches: batchBreakdown(),
		reminders: reminderEffectiveness(5),
		deadlineLabel: deadline ? formatLongDate(deadline) : '',
		deadlinePassed: isRsvpClosed(),
		daysToWedding: Number.isNaN(weddingDate.getTime())
			? null
			: countdownTo(weddingDate).days,
		siteUrl: getConfig().siteUrl
	};
};
