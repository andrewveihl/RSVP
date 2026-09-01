/**
 * Email templates and the send log.
 */
import type { EmailLogEntry, EmailStatus, EmailTemplate } from '../types';
import { getDb, nowIso } from './connection';
import { newId } from '../tokens';

interface TemplateRow {
	id: string;
	name: string;
	subject: string;
	body_html: string;
	created_at: string;
	updated_at: string;
}

function rowToTemplate(row: TemplateRow): EmailTemplate {
	return {
		id: row.id,
		name: row.name,
		subject: row.subject,
		bodyHtml: row.body_html,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export function listTemplates(): EmailTemplate[] {
	const rows = getDb()
		.prepare('SELECT * FROM email_templates ORDER BY created_at ASC')
		.all() as TemplateRow[];
	return rows.map(rowToTemplate);
}

export function getTemplate(id: string): EmailTemplate | null {
	const row = getDb().prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as
		| TemplateRow
		| undefined;
	return row ? rowToTemplate(row) : null;
}

export function createTemplate(input: { name: string; subject: string; bodyHtml: string }): EmailTemplate {
	const timestamp = nowIso();
	const row: TemplateRow = {
		id: newId(),
		name: input.name,
		subject: input.subject,
		body_html: input.bodyHtml,
		created_at: timestamp,
		updated_at: timestamp
	};

	getDb()
		.prepare(
			`INSERT INTO email_templates (id, name, subject, body_html, created_at, updated_at)
			 VALUES (@id, @name, @subject, @body_html, @created_at, @updated_at)`
		)
		.run(row);

	return rowToTemplate(row);
}

export function updateTemplate(
	id: string,
	input: { name: string; subject: string; bodyHtml: string }
): EmailTemplate | null {
	getDb()
		.prepare('UPDATE email_templates SET name = ?, subject = ?, body_html = ?, updated_at = ? WHERE id = ?')
		.run(input.name, input.subject, input.bodyHtml, nowIso(), id);
	return getTemplate(id);
}

export function deleteTemplate(id: string): boolean {
	// email_log keeps its rows and drops the reference (ON DELETE SET NULL), so
	// deleting a template never erases the record that mail went out.
	return getDb().prepare('DELETE FROM email_templates WHERE id = ?').run(id).changes > 0;
}

// --- Send log ---------------------------------------------------------------

interface EmailLogRow {
	id: string;
	household_id: string;
	template_id: string | null;
	subject: string;
	sent_at: string;
	status: string;
	error: string | null;
}

function rowToLog(row: EmailLogRow): EmailLogEntry {
	return {
		id: row.id,
		householdId: row.household_id,
		templateId: row.template_id,
		subject: row.subject,
		sentAt: row.sent_at,
		status: row.status as EmailStatus,
		error: row.error
	};
}

export function recordEmail(input: {
	householdId: string;
	templateId: string | null;
	subject: string;
	status: EmailStatus;
	error?: string | null;
}): EmailLogEntry {
	const row: EmailLogRow = {
		id: newId(),
		household_id: input.householdId,
		template_id: input.templateId,
		subject: input.subject,
		sent_at: nowIso(),
		status: input.status,
		error: input.error ?? null
	};

	getDb()
		.prepare(
			`INSERT INTO email_log (id, household_id, template_id, subject, sent_at, status, error)
			 VALUES (@id, @household_id, @template_id, @subject, @sent_at, @status, @error)`
		)
		.run(row);

	return rowToLog(row);
}

export function listEmailLog(options: { householdId?: string; limit?: number; offset?: number } = {}): EmailLogEntry[] {
	const where = options.householdId ? 'WHERE household_id = ?' : '';
	const params: (string | number)[] = options.householdId ? [options.householdId] : [];

	const rows = getDb()
		.prepare(`SELECT * FROM email_log ${where} ORDER BY sent_at DESC LIMIT ? OFFSET ?`)
		.all(...params, options.limit ?? 100, options.offset ?? 0) as EmailLogRow[];

	return rows.map(rowToLog);
}

export function countEmailLog(householdId?: string): number {
	const where = householdId ? 'WHERE household_id = ?' : '';
	const params = householdId ? [householdId] : [];
	const row = getDb().prepare(`SELECT COUNT(*) AS n FROM email_log ${where}`).get(...params) as {
		n: number;
	};
	return row.n;
}
