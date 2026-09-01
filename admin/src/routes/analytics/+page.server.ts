import type { PageServerLoad } from './$types';
import {
	batchBreakdown,
	dailyActivity,
	getDashboardStats,
	reminderEffectiveness,
	responseTimeline
} from '$shared/db';

export const load: PageServerLoad = () => ({
	stats: getDashboardStats(),
	timeline: responseTimeline(),
	activity: dailyActivity(60),
	batches: batchBreakdown(),
	reminders: reminderEffectiveness(10)
});
