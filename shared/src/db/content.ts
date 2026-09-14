/**
 * The site's editable content, one JSON document per section.
 *
 * Reads always merge what is stored over the defaults rather than trusting the stored
 * document wholesale. That matters on upgrade: a section gains a field, the couple's
 * saved JSON does not have it, and without the merge the guest site would render
 * `undefined` where the new field belongs.
 */
import type { SiteContent, SiteContentKey } from '../types';
import { defaultSiteContent } from '../defaults';
import { getDb, nowIso } from './connection';
import { logError } from '../logger';

interface ContentRow {
	key: string;
	value: string;
	updated_at: string;
}

/**
 * Shallow-merges a stored document over its default.
 *
 * Only the top level is merged: arrays (milestones, FAQ items, party members) are
 * replaced whole, because an admin who deletes the last milestone means it, and a deep
 * merge would resurrect the defaults they just removed.
 */
function mergeSection<T extends object>(fallback: T, stored: unknown): T {
	if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return fallback;

	// A plain spread would let a stored `null` win over a perfectly good default, and
	// that is not a theoretical worry -- `hexToTriplet(theme.accent)` runs in the root
	// layout of every guest page, so one null accent in this document would answer 500
	// for the whole site. A key that is present but empty is a real answer and is kept;
	// a key that is absent, null or undefined is not an answer at all.
	const merged = { ...fallback };

	for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
		if (value === null || value === undefined) continue;
		if (!(key in merged)) continue; // A field this version does not know about.
		(merged as Record<string, unknown>)[key] = value;
	}

	return merged;
}

export function getSection<K extends SiteContentKey>(key: K, coupleNames?: string): SiteContent[K] {
	const fallback = defaultSiteContent(coupleNames)[key];

	const row = getDb().prepare('SELECT * FROM site_content WHERE key = ?').get(key) as
		| ContentRow
		| undefined;
	if (!row) return fallback;

	try {
		const parsed = JSON.parse(row.value) as unknown;
		if (typeof fallback === 'string') {
			return (typeof parsed === 'string' ? parsed : fallback) as SiteContent[K];
		}
		return mergeSection(fallback as object, parsed) as SiteContent[K];
	} catch (error) {
		// Corrupt JSON must not take the guest site down; fall back and say so.
		logError('Malformed site_content row; using defaults', error, { key });
		return fallback;
	}
}

export function setSection<K extends SiteContentKey>(key: K, value: SiteContent[K]): void {
	getDb()
		.prepare(
			`INSERT INTO site_content (key, value, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
		)
		.run(key, JSON.stringify(value), nowIso());
}

/** The whole site in one read -- what the guest layout loads on every request. */
export function getSiteContent(coupleNames?: string): SiteContent {
	const defaults = defaultSiteContent(coupleNames);
	const keys = Object.keys(defaults) as SiteContentKey[];

	const result = {} as SiteContent;
	for (const key of keys) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- keyed assignment.
		(result as any)[key] = getSection(key, coupleNames);
	}
	return result;
}

/** Restores one section to its shipped default, used by the editor's Reset button. */
export function resetSection(key: SiteContentKey): void {
	getDb().prepare('DELETE FROM site_content WHERE key = ?').run(key);
}
