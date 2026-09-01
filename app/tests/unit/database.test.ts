import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropDatabase, freshDatabase, makeHousehold } from './helpers';
import {
	countHouseholds,
	deleteHousehold,
	deleteHouseholds,
	findHouseholdByName,
	getHousehold,
	getHouseholdByToken,
	getHouseholdWithRsvp,
	listBatches,
	listHouseholds,
	markInvitationSent,
	regenerateToken,
	searchHouseholdsByName,
	updateHousehold
} from '$shared/db/households';
import { getRsvpForHousehold, saveRsvp, deleteRsvp, countRsvpsBetween } from '$shared/db/rsvps';
import { countActivity, listActivity, logActivity } from '$shared/db/activity';
import { createTemplate, listTemplates, recordEmail, listEmailLog, deleteTemplate } from '$shared/db/emails';
import { getSection, setSection, resetSection } from '$shared/db/content';
import { getSetting, setSetting } from '$shared/db/settings';
import { getDashboardStats, responseTimeline, batchBreakdown } from '$shared/db/stats';
import { getDb } from '$shared/db/connection';

beforeEach(freshDatabase);
afterEach(dropDatabase);

describe('households', () => {
	it('creates a household with a unique token', () => {
		const a = makeHousehold({ name: 'The Smiths' });
		const b = makeHousehold({ name: 'The Joneses' });

		expect(a.token).not.toBe(b.token);
		expect(a.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(getHouseholdByToken(a.token)?.id).toBe(a.id);
	});

	it('finds a household by name case-insensitively', () => {
		makeHousehold({ name: 'The Whitfield Family' });
		expect(findHouseholdByName('the whitfield family')?.name).toBe('The Whitfield Family');
		expect(findHouseholdByName('Whitfield')).toBeNull();
	});

	it('updates only the fields given', () => {
		const household = makeHousehold({ name: 'Original', email: 'a@example.com', partySize: 4 });

		const updated = updateHousehold(household.id, { name: 'Renamed' });

		expect(updated?.name).toBe('Renamed');
		expect(updated?.email).toBe('a@example.com');
		expect(updated?.partySize).toBe(4);
	});

	it('cascades the RSVP when a household is deleted', () => {
		const household = makeHousehold();
		saveRsvp({ householdId: household.id, attending: true, guestCount: 2, plusOneCount: 0 });

		deleteHousehold(household.id);

		expect(getHousehold(household.id)).toBeNull();
		expect(getRsvpForHousehold(household.id)).toBeNull();
	});

	it('keeps activity entries after the household goes, dropping the reference', () => {
		const household = makeHousehold({ name: 'The Doomed' });
		logActivity({ eventType: 'guest_added', description: 'Added The Doomed', householdId: household.id });

		deleteHousehold(household.id);

		const entries = listActivity();
		expect(entries).toHaveLength(1);
		// ON DELETE SET NULL: the history survives, the foreign key does not.
		expect(entries[0].householdId).toBeNull();
	});

	it('rotates a token, invalidating the old link', () => {
		const household = makeHousehold();
		const token = regenerateToken(household.id);

		expect(token).not.toBe(household.token);
		expect(getHouseholdByToken(household.token)).toBeNull();
		expect(getHouseholdByToken(token!)?.id).toBe(household.id);
	});

	it('marks invitations sent in bulk', () => {
		const a = makeHousehold();
		const b = makeHousehold();

		expect(markInvitationSent([a.id, b.id], true)).toBe(2);
		expect(getHousehold(a.id)?.invitationSent).toBe(true);
		expect(getHousehold(a.id)?.invitationSentAt).toBeTruthy();

		markInvitationSent([a.id], false);
		expect(getHousehold(a.id)?.invitationSent).toBe(false);
		expect(getHousehold(a.id)?.invitationSentAt).toBeNull();
	});

	it('deletes nothing when given an empty id list', () => {
		makeHousehold();
		expect(deleteHouseholds([])).toBe(0);
		expect(markInvitationSent([], true)).toBe(0);
		expect(countHouseholds()).toBe(1);
	});
});

describe('household listing', () => {
	it('filters by status', () => {
		const attending = makeHousehold({ name: 'Yes' });
		const declined = makeHousehold({ name: 'No' });
		makeHousehold({ name: 'Silent' });

		saveRsvp({ householdId: attending.id, attending: true, guestCount: 2, plusOneCount: 1 });
		saveRsvp({ householdId: declined.id, attending: false, guestCount: 0, plusOneCount: 0 });

		expect(listHouseholds({ status: 'attending' }).map((h) => h.name)).toEqual(['Yes']);
		expect(listHouseholds({ status: 'declined' }).map((h) => h.name)).toEqual(['No']);
		expect(listHouseholds({ status: 'pending' }).map((h) => h.name)).toEqual(['Silent']);
		expect(countHouseholds({ status: 'pending' })).toBe(1);
	});

	it('derives the attending total from the RSVP', () => {
		const household = makeHousehold();
		saveRsvp({ householdId: household.id, attending: true, guestCount: 3, plusOneCount: 2 });

		const joined = getHouseholdWithRsvp(household.id);
		expect(joined?.status).toBe('attending');
		expect(joined?.attendingTotal).toBe(5);
	});

	it('treats LIKE wildcards in a search as literal characters', () => {
		makeHousehold({ name: 'The 100% Club' });
		makeHousehold({ name: 'Ordinary Family' });

		// Without escaping, '%' would match every row.
		expect(listHouseholds({ search: '100%' }).map((h) => h.name)).toEqual(['The 100% Club']);
		expect(listHouseholds({ search: '_' })).toHaveLength(0);
	});

	it('sorts by a mapped column in both directions', () => {
		makeHousehold({ name: 'Beta', partySize: 1 });
		makeHousehold({ name: 'Alpha', partySize: 9 });

		expect(listHouseholds({ sort: 'name' }).map((h) => h.name)).toEqual(['Alpha', 'Beta']);
		expect(listHouseholds({ sort: 'party_size', direction: 'desc' }).map((h) => h.name)).toEqual([
			'Alpha',
			'Beta'
		]);
	});

	it('paginates', () => {
		for (let index = 0; index < 5; index += 1) makeHousehold({ name: `Family ${index}` });

		expect(listHouseholds({ limit: 2, offset: 0 })).toHaveLength(2);
		expect(listHouseholds({ limit: 2, offset: 4 })).toHaveLength(1);
		expect(countHouseholds()).toBe(5);
	});

	it('lists the batches in use', () => {
		makeHousehold({ batch: 'Wave 1' });
		makeHousehold({ batch: 'Wave 1' });
		makeHousehold({ batch: 'Wave 2' });
		makeHousehold();

		expect(listBatches()).toEqual(['Wave 1', 'Wave 2']);
	});

	it('needs at least two characters to search by name', () => {
		makeHousehold({ name: 'Anderson' });
		expect(searchHouseholdsByName('A')).toHaveLength(0);
		expect(searchHouseholdsByName('An')).toHaveLength(1);
	});
});

describe('rsvps', () => {
	it('upserts rather than stacking replies', () => {
		const household = makeHousehold();

		const first = saveRsvp({ householdId: household.id, attending: true, guestCount: 2, plusOneCount: 0 });
		const second = saveRsvp({ householdId: household.id, attending: true, guestCount: 4, plusOneCount: 1 });

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(second.rsvp.id).toBe(first.rsvp.id);
		expect(getRsvpForHousehold(household.id)?.guestCount).toBe(4);

		const count = getDb().prepare('SELECT COUNT(*) AS n FROM rsvps').get() as { n: number };
		expect(count.n).toBe(1);
	});

	it('zeroes the counts on a decline, whatever the form sent', () => {
		const household = makeHousehold();
		const { rsvp } = saveRsvp({
			householdId: household.id,
			attending: false,
			guestCount: 4,
			plusOneCount: 2
		});

		expect(rsvp.guestCount).toBe(0);
		expect(rsvp.plusOneCount).toBe(0);
	});

	it('keeps the original submission time when a reply is updated', async () => {
		const household = makeHousehold();
		const first = saveRsvp({ householdId: household.id, attending: true, guestCount: 1, plusOneCount: 0 });

		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = saveRsvp({ householdId: household.id, attending: false, guestCount: 0, plusOneCount: 0 });

		// submitted_at is what the response-rate chart measures, so an edit must not
		// move a household to today.
		expect(second.rsvp.submittedAt).toBe(first.rsvp.submittedAt);
		expect(second.rsvp.updatedAt >= first.rsvp.updatedAt).toBe(true);
	});

	it('counts replies inside a window', () => {
		const household = makeHousehold();
		saveRsvp({ householdId: household.id, attending: true, guestCount: 1, plusOneCount: 0 });

		expect(countRsvpsBetween('2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z')).toBe(1);
		expect(countRsvpsBetween('2000-01-01T00:00:00.000Z', '2000-01-02T00:00:00.000Z')).toBe(0);
	});

	it('clears a reply', () => {
		const household = makeHousehold();
		saveRsvp({ householdId: household.id, attending: true, guestCount: 1, plusOneCount: 0 });

		expect(deleteRsvp(household.id)).toBe(true);
		expect(deleteRsvp(household.id)).toBe(false);
		expect(getHouseholdWithRsvp(household.id)?.status).toBe('pending');
	});
});

describe('activity log', () => {
	it('round-trips metadata as JSON', () => {
		logActivity({
			eventType: 'reminder_sent',
			description: 'Sent a batch',
			metadata: { recipients: 12, template: 'First Reminder' }
		});

		expect(listActivity()[0].metadata).toEqual({ recipients: 12, template: 'First Reminder' });
	});

	it('survives a row with unparseable metadata', () => {
		getDb()
			.prepare(
				`INSERT INTO activity_log (id, event_type, description, metadata, created_at)
				 VALUES ('x', 'guest_added', 'Legacy row', 'not json', '2027-01-01T00:00:00.000Z')`
			)
			.run();

		const entries = listActivity();
		expect(entries).toHaveLength(1);
		expect(entries[0].metadata).toBeNull();
	});

	it('filters by type, household and date range', () => {
		const household = makeHousehold();
		logActivity({ eventType: 'guest_added', description: 'A', householdId: household.id });
		logActivity({ eventType: 'reminder_sent', description: 'B' });

		expect(listActivity({ eventType: 'reminder_sent' })).toHaveLength(1);
		expect(listActivity({ householdId: household.id })).toHaveLength(1);
		expect(countActivity({ from: '2999-01-01T00:00:00.000Z' })).toBe(0);
		expect(listActivity({ search: 'A' }).map((entry) => entry.description)).toEqual(['A']);
	});

	it('never throws, even when the write fails', () => {
		// A household id that does not exist violates the foreign key.
		expect(() =>
			logActivity({ eventType: 'guest_added', description: 'Orphan', householdId: 'nope' })
		).not.toThrow();
	});
});

describe('email templates and log', () => {
	it('keeps the send log when a template is deleted', () => {
		const household = makeHousehold();
		const template = createTemplate({ name: 'Reminder', subject: 'Hi', bodyHtml: '<p>Hi</p>' });
		recordEmail({ householdId: household.id, templateId: template.id, subject: 'Hi', status: 'sent' });

		deleteTemplate(template.id);

		const log = listEmailLog();
		expect(log).toHaveLength(1);
		expect(log[0].templateId).toBeNull();
		expect(listTemplates()).toHaveLength(0);
	});

	it('records failures with their reason', () => {
		const household = makeHousehold();
		recordEmail({
			householdId: household.id,
			templateId: null,
			subject: 'Hi',
			status: 'failed',
			error: 'Mailbox unavailable'
		});

		expect(listEmailLog()[0]).toMatchObject({ status: 'failed', error: 'Mailbox unavailable' });
	});
});

describe('site content', () => {
	it('returns defaults before anything is saved', () => {
		expect(getSection('faq').items.length).toBeGreaterThan(0);
		expect(getSection('sections').countdown).toBe(true);
	});

	it('merges a stored section over the defaults', () => {
		// A document saved by an older build, missing a field the current one has.
		getDb()
			.prepare("INSERT INTO site_content (key, value, updated_at) VALUES ('hero', ?, '2027-01-01')")
			.run(JSON.stringify({ title: 'A & M' }));

		const hero = getSection('hero');
		expect(hero.title).toBe('A & M');
		// Filled in from the defaults rather than left undefined.
		expect(typeof hero.subtitle).toBe('string');
		expect(hero.imageId).toBeNull();
	});

	it('replaces list sections wholesale rather than merging them', () => {
		setSection('faq', { heading: 'Questions', intro: '', items: [] });
		// Deleting every FAQ means deleting every FAQ -- the defaults must not return.
		expect(getSection('faq').items).toEqual([]);
	});

	it('falls back to defaults when the stored JSON is corrupt', () => {
		getDb()
			.prepare("INSERT INTO site_content (key, value, updated_at) VALUES ('hero', '{{{', '2027-01-01')")
			.run();

		expect(getSection('hero').title).toBeTruthy();
	});

	it('resets a section back to its default', () => {
		setSection('announcement', 'Venue changed');
		expect(getSection('announcement')).toBe('Venue changed');

		resetSection('announcement');
		expect(getSection('announcement')).toBe('');
	});
});

describe('settings', () => {
	it('prefers a stored value over the environment default', () => {
		expect(getSetting('couple_names')).toBe('Andrew & Madeline');

		setSetting('couple_names', 'A & M');
		expect(getSetting('couple_names')).toBe('A & M');
	});

	it('treats an empty stored value as unset', () => {
		setSetting('couple_names', '');
		expect(getSetting('couple_names')).toBe('Andrew & Madeline');
	});
});

describe('stats', () => {
	it('computes the dashboard aggregate', () => {
		const yes = makeHousehold({ name: 'Yes', partySize: 2 });
		const no = makeHousehold({ name: 'No', partySize: 3 });
		makeHousehold({ name: 'Pending', partySize: 4 });

		saveRsvp({ householdId: yes.id, attending: true, guestCount: 2, plusOneCount: 1 });
		saveRsvp({ householdId: no.id, attending: false, guestCount: 0, plusOneCount: 0 });

		const stats = getDashboardStats();
		expect(stats.households).toBe(3);
		expect(stats.invitedGuests).toBe(9);
		expect(stats.responded).toBe(2);
		expect(stats.responseRate).toBe(67);
		expect(stats.attendingGuests).toBe(3);
		expect(stats.plusOnes).toBe(1);
		expect(stats.declinedGuests).toBe(3);
		expect(stats.pendingGuests).toBe(4);
	});

	it('reports zero rather than NaN for an empty guest list', () => {
		expect(getDashboardStats()).toMatchObject({ households: 0, responseRate: 0, attendingGuests: 0 });
	});

	it('builds a gap-free timeline', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		saveRsvp({ householdId: a.id, attending: true, guestCount: 1, plusOneCount: 0 });
		saveRsvp({ householdId: b.id, attending: false, guestCount: 0, plusOneCount: 0 });

		// Push one reply three days into the past, leaving two empty days between.
		const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
		getDb().prepare('UPDATE rsvps SET submitted_at = ? WHERE household_id = ?').run(past, a.id);

		const timeline = responseTimeline();
		expect(timeline).toHaveLength(4);
		expect(timeline.map((point) => point.responses)).toEqual([1, 0, 0, 1]);
		expect(timeline.at(-1)?.cumulative).toBe(2);
	});

	it('groups unbatched households under Unassigned', () => {
		makeHousehold({ batch: 'Wave 1' });
		makeHousehold();

		const batches = batchBreakdown();
		expect(batches.map((batch) => batch.batch).sort()).toEqual(['Unassigned', 'Wave 1']);
	});
});
