import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropDatabase, freshDatabase, makeHousehold } from './helpers';
import {
	MAX_GUESTS,
	maxGuestsFor,
	splitGuests,
	submitRsvp,
	validateRsvpForm
} from '$shared/rsvp-service';
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
			expect(validateRsvpForm({ attending: value, guestTotal: '2' })).toMatchObject({
				ok: true,
				attending: true,
				guestTotal: 2
			});
		}
	});

	it('zeroes the count on a decline', () => {
		expect(validateRsvpForm({ attending: 'no', guestTotal: '4' })).toEqual({
			ok: true,
			attending: false,
			guestTotal: 0
		});
	});

	it('rejects an unanswered form', () => {
		expect(validateRsvpForm({ attending: null })).toMatchObject({ ok: false, field: 'attending' });
	});

	it('rejects a total that is not a plain integer', () => {
		for (const value of ['', '0', '-1', '2.5', '3abc', '1e3', String(MAX_GUESTS + 1)]) {
			const result = validateRsvpForm({ attending: 'yes', guestTotal: value });
			expect(result, `for ${JSON.stringify(value)}`).toMatchObject({
				ok: false,
				field: 'guestTotal'
			});
		}
	});

	it('accepts a party larger than the one invited', () => {
		// Uncapped unless the household says otherwise; the split against the invited
		// size happens later.
		expect(validateRsvpForm({ attending: 'yes', guestTotal: '12' })).toMatchObject({
			ok: true,
			guestTotal: 12
		});
	});

	it('refuses a total above the household ceiling, and says who to ask', () => {
		const result = validateRsvpForm({ attending: 'yes', guestTotal: '5' }, 3);

		expect(result).toMatchObject({ ok: false, field: 'guestTotal' });
		expect((result as { error: string }).error).toContain('3 guests');
		expect((result as { error: string }).error).toContain('get in touch');
	});

	it('still tells a guest the range when the number was nonsense', () => {
		const result = validateRsvpForm({ attending: 'yes', guestTotal: 'lots' }, 3);
		expect((result as { error: string }).error).toContain('1 to 3');
	});

	it('accepts the ceiling itself', () => {
		expect(validateRsvpForm({ attending: 'yes', guestTotal: '3' }, 3)).toMatchObject({
			ok: true,
			guestTotal: 3
		});
	});

	it('fails silently when the honeypot is filled', () => {
		const result = validateRsvpForm({ attending: 'yes', guestTotal: '2', honeypot: 'http://spam' });
		expect(result).toMatchObject({ ok: false, silent: true });
	});

	it('ignores an empty honeypot, which is what a real browser sends', () => {
		expect(validateRsvpForm({ attending: 'yes', guestTotal: '2', honeypot: '' })).toMatchObject({
			ok: true
		});
	});
});

describe('maxGuestsFor', () => {
	it('treats no cap as the global ceiling, which is how it always behaved', () => {
		expect(maxGuestsFor({ partySize: 2, maxExtraGuests: null })).toBe(MAX_GUESTS);
	});

	it('adds the allowance to the invited party', () => {
		// A couple who may bring one partner between them.
		expect(maxGuestsFor({ partySize: 2, maxExtraGuests: 1 })).toBe(3);
		// A family whose children are already counted, and who may bring nobody else.
		expect(maxGuestsFor({ partySize: 5, maxExtraGuests: 0 })).toBe(5);
	});

	it('never exceeds the global ceiling, whatever is stored', () => {
		expect(maxGuestsFor({ partySize: 40, maxExtraGuests: 20 })).toBe(MAX_GUESTS);
	});

	it('is never below one, so a broken party size cannot lock a guest out', () => {
		expect(maxGuestsFor({ partySize: 0, maxExtraGuests: 0 })).toBe(1);
	});
});

describe('splitGuests', () => {
	/**
	 * The guest answers one number; the couple need two. This is the whole of that
	 * translation, so it is worth pinning down precisely.
	 */
	it('counts everything up to the invited size as the household', () => {
		expect(splitGuests(2, 4)).toEqual({ guestCount: 2, plusOneCount: 0 });
		expect(splitGuests(4, 4)).toEqual({ guestCount: 4, plusOneCount: 0 });
	});

	it('counts anything beyond the invited size as a plus-one', () => {
		expect(splitGuests(6, 4)).toEqual({ guestCount: 4, plusOneCount: 2 });
		expect(splitGuests(2, 1)).toEqual({ guestCount: 1, plusOneCount: 1 });
	});

	it('treats a party size of zero as one, rather than making everyone a plus-one', () => {
		expect(splitGuests(2, 0)).toEqual({ guestCount: 1, plusOneCount: 1 });
	});
});

describe('submitRsvp', () => {
	it('stores the reply, split against the invited party size', () => {
		const household = makeHousehold({ name: 'The Smiths', partySize: 2 });

		const outcome = submitRsvp(
			{ attending: 'yes', guestTotal: '3' },
			{ household, ipAddress: '203.0.113.9', userAgent: 'test' }
		);

		expect(outcome.ok).toBe(true);
		// Invited 2, three came: two of them plus one extra.
		expect(getRsvpForHousehold(household.id)).toMatchObject({
			attending: true,
			guestCount: 2,
			plusOneCount: 1,
			ipAddress: '203.0.113.9'
		});

		const entries = listActivity();
		expect(entries[0].eventType).toBe('rsvp_submitted');
		expect(entries[0].description).toContain('The Smiths');
		// The log records the number the guest actually gave.
		expect(entries[0].description).toContain('attending (3)');
	});

	it('turns a guest away above their household cap, and stores nothing', () => {
		const household = makeHousehold({ partySize: 2, maxExtraGuests: 1 });

		const outcome = submitRsvp({ attending: 'yes', guestTotal: '4' }, { household });

		expect(outcome).toMatchObject({ ok: false, reason: 'invalid', field: 'guestTotal' });
		expect(getRsvpForHousehold(household.id)).toBeNull();
	});

	it('accepts exactly the cap', () => {
		const household = makeHousehold({ partySize: 2, maxExtraGuests: 1 });
		submitRsvp({ attending: 'yes', guestTotal: '3' }, { household });

		expect(getRsvpForHousehold(household.id)).toMatchObject({
			guestCount: 2,
			plusOneCount: 1
		});
	});

	it('lets a cap of zero refuse every extra, which null does not', () => {
		const capped = makeHousehold({ partySize: 2, maxExtraGuests: 0 });
		const uncapped = makeHousehold({ partySize: 2, maxExtraGuests: null });

		expect(submitRsvp({ attending: 'yes', guestTotal: '3' }, { household: capped }).ok).toBe(false);
		expect(submitRsvp({ attending: 'yes', guestTotal: '3' }, { household: uncapped }).ok).toBe(true);
	});

	/**
	 * The cap is a limit on what we ask guests to do, not on what the couple may write
	 * down. An admin taking a phone call is recording what is true, and being refused by
	 * our own rule would only mean editing the household first and re-typing the reply.
	 */
	it('does not hold an admin to the cap', () => {
		const household = makeHousehold({ partySize: 2, maxExtraGuests: 0 });

		const outcome = submitRsvp(
			{ attending: 'yes', guestTotal: '5' },
			{ household, asAdmin: true }
		);

		expect(outcome.ok).toBe(true);
		expect(getRsvpForHousehold(household.id)).toMatchObject({ guestCount: 2, plusOneCount: 3 });
	});

	it('records no plus-ones when the party arrives as invited', () => {
		const household = makeHousehold({ partySize: 4 });
		submitRsvp({ attending: 'yes', guestTotal: '4' }, { household });

		expect(getRsvpForHousehold(household.id)).toMatchObject({
			guestCount: 4,
			plusOneCount: 0
		});
	});

	it('logs a second reply as an update, not a new submission', () => {
		const household = makeHousehold();
		submitRsvp({ attending: 'yes', guestTotal: '2' }, { household });
		submitRsvp({ attending: 'no' }, { household });

		expect(listActivity()[0].eventType).toBe('rsvp_updated');
	});

	it('turns a guest away after the deadline', () => {
		process.env.RSVP_DEADLINE = '2020-01-01';
		const household = makeHousehold();

		const outcome = submitRsvp({ attending: 'yes', guestTotal: '2' }, { household });

		expect(outcome).toMatchObject({ ok: false, reason: 'closed' });
		expect(getRsvpForHousehold(household.id)).toBeNull();
	});

	it('lets an admin record a reply after the deadline', () => {
		process.env.RSVP_DEADLINE = '2020-01-01';
		const household = makeHousehold();

		const outcome = submitRsvp({ attending: 'yes', guestTotal: '2' }, { household, asAdmin: true });

		expect(outcome.ok).toBe(true);
		expect(listActivity()[0].description).toContain('entered by admin');
	});

	it('stores nothing when the honeypot trips', () => {
		const household = makeHousehold();
		const outcome = submitRsvp({ attending: 'yes', guestTotal: '2', honeypot: 'x' }, { household });

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
