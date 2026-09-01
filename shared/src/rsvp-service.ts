/**
 * The rules that decide whether an RSVP is accepted, shared by the guest form and the
 * admin's manual entry so the two can never disagree about what a valid reply is.
 *
 * The one place they differ is the deadline: it is a *soft* lock. A guest is turned
 * away after it passes; an admin recording a phone call is not. That difference is a
 * single flag rather than a second code path.
 */
import { isRsvpClosed } from './config';
import { parseInteger } from './sanitize';
import { logActivity, saveRsvp, type SaveResult } from './db';
import type { Household } from './types';

/** No cap on plus-ones by design, but a typo of 999999 is not a real answer. */
export const MAX_GUESTS = 50;

export interface RsvpFormInput {
	attending: unknown;
	guestCount?: unknown;
	plusOneCount?: unknown;
	/** Hidden field that only a bot fills in. */
	honeypot?: unknown;
}

export interface ValidationSuccess {
	ok: true;
	attending: boolean;
	guestCount: number;
	plusOneCount: number;
}

export interface ValidationFailure {
	ok: false;
	error: string;
	field?: 'attending' | 'guestCount' | 'plusOneCount';
	/** Set when the submission looked automated; the caller answers 200 and discards. */
	silent?: boolean;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validates one submission.
 *
 * A tripped honeypot returns a *silent* failure rather than an error the caller shows.
 * Telling a bot precisely which field gave it away is free tuning information, and the
 * handful of real guests who could ever hit it are better served by a page that looks
 * like it worked than by an accusation.
 */
export function validateRsvpForm(input: RsvpFormInput): ValidationResult {
	if (typeof input.honeypot === 'string' && input.honeypot.trim() !== '') {
		return { ok: false, error: 'Thanks!', silent: true };
	}

	const raw = typeof input.attending === 'string' ? input.attending.trim().toLowerCase() : input.attending;
	let attending: boolean;
	if (raw === 'yes' || raw === 'true' || raw === '1' || raw === true) attending = true;
	else if (raw === 'no' || raw === 'false' || raw === '0' || raw === false) attending = false;
	else return { ok: false, error: 'Please let us know whether you can make it.', field: 'attending' };

	if (!attending) {
		// A decline carries no counts, whatever the form happened to send.
		return { ok: true, attending: false, guestCount: 0, plusOneCount: 0 };
	}

	const guestCount = parseInteger(input.guestCount, { min: 1, max: MAX_GUESTS });
	if (guestCount === null) {
		return {
			ok: false,
			error: `Please enter how many people are coming (1 to ${MAX_GUESTS}).`,
			field: 'guestCount'
		};
	}

	const plusOneCount = parseInteger(input.plusOneCount ?? 0, { min: 0, max: MAX_GUESTS });
	if (plusOneCount === null) {
		return {
			ok: false,
			error: `Please enter a number of additional guests (0 to ${MAX_GUESTS}).`,
			field: 'plusOneCount'
		};
	}

	return { ok: true, attending: true, guestCount, plusOneCount };
}

export interface SubmitContext {
	household: Household;
	ipAddress?: string | null;
	userAgent?: string | null;
	/** True when an admin is recording the reply, which bypasses the deadline. */
	asAdmin?: boolean;
	now?: Date;
}

export type SubmitOutcome =
	| { ok: true; result: SaveResult }
	| { ok: false; error: string; reason: 'closed' | 'invalid'; field?: string; silent?: boolean };

/** Validate, check the deadline, persist, and write the audit entry -- in that order. */
export function submitRsvp(input: RsvpFormInput, context: SubmitContext): SubmitOutcome {
	const validation = validateRsvpForm(input);
	if (!validation.ok) {
		return {
			ok: false,
			error: validation.error,
			reason: 'invalid',
			field: validation.field,
			silent: validation.silent
		};
	}

	if (!context.asAdmin && isRsvpClosed(context.now ?? new Date())) {
		return {
			ok: false,
			reason: 'closed',
			error: 'The RSVP deadline has passed. Please get in touch and we will add you.'
		};
	}

	const result = saveRsvp({
		householdId: context.household.id,
		attending: validation.attending,
		guestCount: validation.guestCount,
		plusOneCount: validation.plusOneCount,
		ipAddress: context.ipAddress ?? null,
		userAgent: context.userAgent ?? null
	});

	const total = validation.guestCount + validation.plusOneCount;
	const answer = validation.attending ? `attending (${total})` : 'not attending';

	logActivity({
		eventType: result.created ? 'rsvp_submitted' : 'rsvp_updated',
		description: `${context.household.name} responded: ${answer}${context.asAdmin ? ' (entered by admin)' : ''}`,
		householdId: context.household.id,
		metadata: {
			attending: validation.attending,
			guestCount: validation.guestCount,
			plusOneCount: validation.plusOneCount,
			viaAdmin: Boolean(context.asAdmin)
		},
		ipAddress: context.ipAddress ?? null
	});

	return { ok: true, result };
}
