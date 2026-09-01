import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { mergeSource } from '$lib/server/merge-context';
import {
	createTemplate,
	deleteTemplate,
	getHouseholdsByIds,
	getTemplate,
	listEmailLog,
	listHouseholds,
	listPendingHouseholds,
	listTemplates,
	logActivity,
	updateTemplate
} from '$shared/db';
import { requireText, sanitizeHtml } from '$shared/sanitize';
import {
	MERGE_FIELDS,
	MERGE_FIELD_HELP,
	SAMPLE_CONTEXT,
	contextForHousehold,
	htmlToText,
	renderSubject,
	renderTemplate,
	wrapEmailHtml
} from '$shared/email-template';
import { isMailConfigured, sendBatch } from '$shared/mailer';

export const load: PageServerLoad = ({ url }) => {
	const templates = listTemplates();
	const selectedId = url.searchParams.get('template');
	const selected = selectedId ? getTemplate(selectedId) : (templates[0] ?? null);
	const source = mergeSource();

	return {
		// The editor's open state lives in the URL, so it survives a form post and a
		// reload, and so a link can open a specific template.
		editorOpen: url.searchParams.has('template'),
		justSaved: url.searchParams.get('saved') === '1',
		templates,
		selected,
		// The preview renders the body only, not the full document `wrapEmailHtml`
		// produces: a `<!doctype>` and a `<head>` inside a `<div>` is not something a
		// browser can render sensibly, and the wrapper is only styling anyway.
		preview: selected
			? {
					subject: renderSubject(selected.subject, SAMPLE_CONTEXT),
					html: renderTemplate(sanitizeHtml(selected.bodyHtml), SAMPLE_CONTEXT)
				}
			: null,
		mergeFields: MERGE_FIELDS.map((field) => ({ field, help: MERGE_FIELD_HELP[field] })),
		pending: listPendingHouseholds(),
		households: listHouseholds({ sort: 'name' }),
		log: listEmailLog({ limit: 100 }),
		mailConfigured: isMailConfigured(),
		source
	};
};

export const actions: Actions = {
	saveTemplate: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const id = result.form.get('id')?.toString() ?? '';
		const name = requireText(result.form.get('name'), 120);
		const subject = requireText(result.form.get('subject'), 300);
		// Sanitised on the way in *and* re-sanitised on the way out when rendered, so a
		// row written before this rule existed is still safe to display.
		const bodyHtml = sanitizeHtml(result.form.get('bodyHtml'));

		if (!name || !subject) return fail(400, { error: 'A name and a subject line are required.' });
		if (!bodyHtml.trim()) return fail(400, { error: 'The email body cannot be empty.' });

		const template = id
			? updateTemplate(id, { name, subject, bodyHtml })
			: createTemplate({ name, subject, bodyHtml });

		if (!template) return fail(404, { error: 'That template no longer exists.' });

		// Redirect rather than return, so the editor stays open on the template just
		// saved and the preview re-renders from the stored copy. Returning would drop
		// the `?template=` that keeps the panel open, collapsing the editor the moment
		// the admin saved -- and a newly created template would have nowhere to land.
		redirect(303, `/emails?template=${template.id}&saved=1`);
	},

	deleteTemplate: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const id = result.form.get('id')?.toString() ?? '';
		const template = getTemplate(id);
		if (!template) return fail(404, { error: 'That template no longer exists.' });

		deleteTemplate(id);
		// Back to the list with the editor closed -- the template being edited is gone.
		redirect(303, '/emails?deleted=1');
	},

	/**
	 * Sends one template to a chosen set of households.
	 *
	 * The whole batch is awaited before responding. A wedding guest list is small
	 * enough that the send finishes in seconds, and the alternative -- returning
	 * immediately and sending in the background -- would mean the couple never learns
	 * which addresses bounced.
	 */
	send: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		if (!isMailConfigured()) {
			return fail(400, { error: 'Set GMAIL_USER and GMAIL_APP_PASSWORD before sending.' });
		}

		const templateId = result.form.get('templateId')?.toString() ?? '';
		const template = getTemplate(templateId);
		if (!template) return fail(400, { error: 'Choose a template to send.' });

		const audience = result.form.get('audience')?.toString() ?? 'pending';
		const ids = result.form.getAll('ids').map((value) => value.toString());

		let households =
			audience === 'selected'
				? getHouseholdsByIds(ids)
				: audience === 'all'
					? listHouseholds({ sort: 'name' })
					: listPendingHouseholds();

		// Households with no address are dropped here rather than reported as failures:
		// there was never anything to send, so calling it a failure would make the log
		// read as though mail was bouncing.
		households = households.filter((household) => household.email);

		if (households.length === 0) {
			return fail(400, { error: 'Nobody in that group has an email address on file.' });
		}

		const source = mergeSource();
		const safeBody = sanitizeHtml(template.bodyHtml);

		const messages = households.map((household) => {
			const context = contextForHousehold(household, source);
			const html = wrapEmailHtml(renderTemplate(safeBody, context), source.coupleNames);
			return {
				household,
				message: {
					subject: renderSubject(template.subject, context),
					html,
					text: htmlToText(html)
				}
			};
		});

		const results = await sendBatch(messages, template.id);
		const sent = results.filter((entry) => entry.status === 'sent').length;
		const failed = results.filter((entry) => entry.status === 'failed');

		logActivity({
			eventType: 'reminder_sent',
			description: `Sent "${template.name}" to ${sent} household(s)`,
			// `recipients` is what the reminder-effectiveness table reads back.
			metadata: { recipients: sent, failed: failed.length, templateId: template.id, audience },
			ipAddress: event.locals.clientIp
		});

		return {
			success: `Sent ${sent} email(s).`,
			warning:
				failed.length > 0
					? `${failed.length} failed: ${failed
							.slice(0, 3)
							.map((entry) => entry.householdName)
							.join(', ')}${failed.length > 3 ? '...' : ''}`
					: undefined
		};
	}
};
