/**
 * Test scaffolding for anything that touches the database.
 *
 * Every suite gets a private in-memory database, created fresh in `beforeEach`, so no
 * test can see another's rows and no test can touch a real file. `useDatabase` is the
 * seam the connection module exposes for exactly this.
 */
import { openDatabase, useDatabase, closeDb } from '$shared/db/connection';
import { createHousehold, type NewHousehold } from '$shared/db/households';
import type { Household } from '$shared/types';

export function freshDatabase(): void {
	useDatabase(openDatabase(':memory:'));
}

export function dropDatabase(): void {
	closeDb();
}

let counter = 0;

/** A household with sensible defaults, overridable per test. */
export function makeHousehold(overrides: Partial<NewHousehold> = {}): Household {
	counter += 1;
	return createHousehold({
		name: `Household ${counter}`,
		partySize: 2,
		...overrides
	});
}
