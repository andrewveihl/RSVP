import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropDatabase, freshDatabase, makeHousehold } from './helpers';
import { MAX_GUESTS, submitRsvp, validateRsvpForm } from '$shared/rsvp-service';
import { getRsvpForHousehold } from '$shared/db/rsvps';
import { listActivity } from '$shared/db/activity';
import { isRsvpClosed, rsvpDeadlineDate } from '$shared/config';

beforeEach(freshDatabase);
afterEach(() => {
	dropDatabase();
	delete process.env.RSVP_DEADLINE;
});

describe('validateRsvpForm', () => {
	it('accepts the several ways a form can say yes', () => {
		for (const value of ['yes', 'YES', 'true', '1', true]) {
			expect(validateRsvpForm({ attending: value, guestCount: '2' })).toMatchObject({
				ok: true,
				attending: true,
				guestCount: 2
			});
		}
	});

	it('zeroes the counts on a decline', () => {
		expect(validateRsvpForm({ attending: 'no', guestCount: '4', plusOneCount: '2' })).toEqual({
			ok: true,
			attending: false,
			guestCount: 0,
			plusOneCount: 0
		});
	});

	it('rejects an unanswered form', () => {
		const result = validateRsvpForm({ attending: null });
		expect(result).toMatchObject({ ok: false, field: 'attending' });
	});

	it('rejects a guest count that is not a plain integer', () => {
		for (const value of ['', '0', '-1', '2.5', '3abc', '1e3', String(MAX_GUESTS + 1)]) {
			const result = validateRsvpForm({ attending: 'yes', guestCount: value });
			expect(result, `for ${JSON.stringify(value)}`).toMatchObject({ ok: false, field: 'guestCount' });
		}
	});

	it('allows a large but uncapped-in-spirit number of plus-ones', () => {
		expect(validateRsvpForm({ attending: 'yes', guestCount: '2', plusOneCount: '12' })).toMatchObject({
			ok: true,
			plusOneCount: 12
		});
	});

	it('defaults the plus-one count to zero when absent', () => {
		expect(validateRsvpForm({ attending: 'yes', guestCount: '1' })).toMatchObject({
			ok: true,
			plusOneCount: 0
		});
	});

	it('fails silently when the honeypot is filled', () => {
		const result = validateRsvpForm({ attending: 'yes', guestCount: '2', honeypot: 'http://spam' });
		expect(result).toMatchObject({ ok: false, silent: true });
	});

	it('ignores an empty honeypot, which is what a real browser sends', () => {
		expect(validateRsvpForm({ attending: 'yes', guestCount: '2', honeypot: '' })).toMatchObject({
			ok: true
		});
	});
});

describe('submitRsvp', () => {
	it('stores the reply and logs it', () => {
		const household = makeHousehold({ name: 'The Smiths' });

		const outcome = submitRsvp(
			{ attending: 'yes', guestCount: '2', plusOneCount: '1' },
			{ household, ipAddress: '203.0.113.9', userAgent: 'test' }
		);

		expect(outcome.ok).toBe(true);
		expect(getRsvpForHousehold(household.id)).toMatchObject({
			attending: true,
			guestCount: 2,
			plusOneCount: 1,
			ipAddress: '203.0.113.9'
		});

		const entries = listActivity();
		expect(entries[0].eventType).toBe('rsvp_submitted');
		expect(entries[0].description).toContain('The Smiths');
	});

	it('logs a second reply as an update, not a new submission', () => {
		const household = makeHousehold();
		submitRsvp({ attending: 'yes', guestCount: '2' }, { household });
		submitRsvp({ attending: 'no' }, { household });

		expect(listActivity()[0].eventType).toBe('rsvp_updated');
	});

	it('turns a guest away after the deadline', () => {
		process.env.RSVP_DEADLINE = '2020-01-01';
		const household = makeHousehold();

		const outcome = submitRsvp({ attending: 'yes', guestCount: '2' }, { household });

		expect(outcome).toMatchObject({ ok: false, reason: 'closed' });
		expect(getRsvpForHousehold(household.id)).toBeNull();
	});

	it('lets an admin record a reply after the deadline', () => {
		process.env.RSVP_DEADLINE = '2020-01-01';
		const household = makeHousehold();

		const outcome = submitRsvp({ attending: 'yes', guestCount: '2' }, { household, asAdmin: true });

		expect(outcome.ok).toBe(true);
		expect(listActivity()[0].description).toContain('entered by admin');
	});

	it('stores nothing when the honeypot trips', () => {
		const household = makeHousehold();
		const outcome = submitRsvp({ attending: 'yes', guestCount: '2', honeypot: 'x' }, { household });

		expect(outcome).toMatchObject({ ok: false, silent: true });
		expect(getRsvpForHousehold(household.id)).toBeNull();
		expect(listActivity()).toHaveLength(0);
	});
});

describe('the deadline', () => {
	it('treats a bare date as the end of that day', () => {
		const deadline = rsvpDeadlineDate('2027-04-29');
		expect(deadline?.getHours()).toBe(23);
		expect(isRsvpClosed(new Date('2027-04-29T12:00:00'), '2027-04-29')).toBe(false);
		expect(isRsvpClosed(new Date('2027-04-30T00:00:01'), '2027-04-29')).toBe(true);
	});

	it('stays open when no deadline is configured', () => {
		expect(isRsvpClosed(new Date(), '')).toBe(false);
	});

	it('stays open when the deadline is unparseable', () => {
		// A typo in .env must not silently stop every guest from replying.
		expect(isRsvpClosed(new Date(), 'next Tuesday')).toBe(false);
		expect(rsvpDeadlineDate('next Tuesday')).toBeNull();
	});

	it('honours a full timestamp with an offset', () => {
		expect(isRsvpClosed(new Date('2027-04-29T23:00:00Z'), '2027-04-29T22:00:00Z')).toBe(true);
		expect(isRsvpClosed(new Date('2027-04-29T21:00:00Z'), '2027-04-29T22:00:00Z')).toBe(false);
	});
});
