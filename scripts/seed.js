/**
 * Fills a development database with a plausible guest list.
 *
 *     npm run seed              # 24 households, some already replied
 *     npm run seed -- 100       # a bigger list, to see how the tables hold up
 *
 * Development only. It refuses to touch a database that already has households in it,
 * so it cannot quietly double a real guest list.
 *
 * Deliberately self-contained -- see scripts/backup.js for why a CLI script cannot
 * import the shared TypeScript. It writes only to `households` and `rsvps`, whose
 * columns are fixed by migration 001; if that schema ever changes, this changes with it.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

const DATABASE_PATH = process.env.DATABASE_PATH ?? './data/wedding-rsvp.db';
const count = Math.min(500, Math.max(1, Number.parseInt(process.argv[2] ?? '24', 10) || 24));

if (!existsSync(DATABASE_PATH)) {
	console.error(`No database at ${DATABASE_PATH}.`);
	console.error('Start the app once (npm run dev) so it creates and migrates one, then re-run.');
	process.exit(1);
}

const db = new Database(DATABASE_PATH);
db.pragma('foreign_keys = ON');

const existing = db.prepare('SELECT COUNT(*) AS n FROM households').get();
if (existing.n > 0) {
	console.error(`${DATABASE_PATH} already has ${existing.n} household(s). Refusing to seed over them.`);
	console.error('Delete the file first if this really is a scratch database.');
	process.exit(1);
}

const SURNAMES = [
	'Whitfield', 'Marsh', 'Okonkwo', 'Delgado', 'Fairbanks', 'Nakamura', 'Bell', 'Ashworth',
	'Ferreira', 'Lindqvist', 'Havili', 'Bright', 'Castellan', 'Osei', 'Rutherford', 'Sandoval',
	'Thorne', 'Vasquez', 'Wexler', 'Yates', 'Abernathy', 'Blackwood', 'Cordova', 'Dunmore'
];
const FIRST_NAMES = ['Alex', 'Rowan', 'Priya', 'Marcus', 'Lena', 'Tomas', 'Ines', 'Kofi'];
const BATCHES = ['Save the dates', 'Batch 1', 'Batch 2'];
const STREETS = ['Long Lane', 'Cedar Road', 'Kingfisher Way', 'Mill Street', 'Orchard Close'];
const TOWNS = ['Fairhaven', 'Brookmere', 'Aldercross', 'Westbury'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const chance = (probability) => Math.random() < probability;

const insertHousehold = db.prepare(
	`INSERT INTO households
		(id, name, token, email, phone, mailing_address, party_size, max_extra_guests, batch,
		 notes, invitation_sent, invitation_sent_at, created_at, updated_at)
	 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
);

const insertRsvp = db.prepare(
	`INSERT INTO rsvps
		(id, household_id, attending, guest_count, plus_one_count, submitted_at, updated_at, ip_address, user_agent)
	 VALUES (?, ?, ?, ?, ?, ?, ?, '203.0.113.7', 'seed')`
);

const now = Date.now();
let replied = 0;
let attending = 0;

db.transaction(() => {
	for (let index = 0; index < count; index += 1) {
		const surname = SURNAMES[index % SURNAMES.length];
		const suffix = index >= SURNAMES.length ? ` ${Math.floor(index / SURNAMES.length) + 1}` : '';
		const name = chance(0.6)
			? `The ${surname}${suffix} Family`
			: `${pick(FIRST_NAMES)} & ${pick(FIRST_NAMES)} ${surname}${suffix}`;

		const partySize = 1 + Math.floor(Math.random() * 4);
		const createdAt = new Date(now - Math.floor(Math.random() * 60) * 86_400_000).toISOString();
		const invitationSent = chance(0.7);

		const id = randomUUID();
		insertHousehold.run(
			id,
			name,
			randomBytes(24).toString('base64url'),
			chance(0.8) ? `${surname.toLowerCase()}${index}@example.com` : null,
			chance(0.4) ? `555-01${String(index).padStart(2, '0')}` : null,
			`${1 + index} ${pick(STREETS)}\n${pick(TOWNS)}\nST ${10_000 + index}`,
			partySize,
			// A spread of the three real cases: no limit, one partner, nobody extra.
			// NULL is deliberately the commonest, because it is the default.
			chance(0.5) ? null : chance(0.5) ? 1 : 0,
			pick(BATCHES),
			invitationSent ? 1 : 0,
			invitationSent ? createdAt : null,
			createdAt,
			createdAt
		);

		// Roughly two thirds have replied, and most of those are coming -- which is
		// about what a real guest list looks like a month out.
		if (!chance(0.65)) continue;

		const isAttending = chance(0.78);
		const submittedAt = new Date(now - Math.floor(Math.random() * 30) * 86_400_000).toISOString();

		insertRsvp.run(
			randomUUID(),
			id,
			isAttending ? 1 : 0,
			isAttending ? partySize : 0,
			isAttending && chance(0.25) ? 1 : 0,
			submittedAt,
			submittedAt
		);

		replied += 1;
		if (isAttending) attending += 1;
	}
})();

db.close();

console.log(`Seeded ${count} households into ${DATABASE_PATH}.`);
console.log(`${replied} have replied (${attending} attending, ${replied - attending} declined).`);
