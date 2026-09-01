/**
 * The database package's public surface, plus first-boot seeding.
 *
 * Both apps import from here rather than reaching into individual modules, so the set
 * of operations either app can perform is visible in one place.
 */
export * from './connection';
export * from './households';
export * from './rsvps';
export * from './activity';
export * from './emails';
export * from './content';
export * from './images';
export * from './settings';
export * from './stats';

import { getDb } from './connection';
import { createTemplate, listTemplates } from './emails';
import { defaultEmailTemplates } from '../defaults';

/**
 * Seeds the things an empty database needs to be usable.
 *
 * Called once from each app's boot path. It is idempotent -- both containers start at
 * the same moment against the same file, so it has to be safe to run twice, and the
 * transaction plus the emptiness check makes it so.
 */
export function bootstrapDatabase(): void {
	const db = getDb();

	db.transaction(() => {
		if (listTemplates().length === 0) {
			for (const template of defaultEmailTemplates()) createTemplate(template);
		}
	})();
}
