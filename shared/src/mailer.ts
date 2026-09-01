/**
 * Gmail SMTP delivery via Nodemailer.
 *
 * Gmail's per-account send limits are the reason sends are sequenced with a small gap
 * rather than fired in parallel: a burst of 150 messages in two seconds is exactly what
 * gets an account rate-limited, and a guest list is small enough that a few seconds of
 * pacing costs nothing.
 *
 * Every attempt is recorded in `email_log` -- including the failures. A reminder that
 * silently bounced is worse than one that visibly failed, because the couple would
 * assume the guest had been asked.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getConfig } from './config';
import { logError, logger } from './logger';
import { recordEmail } from './db';
import type { Household } from './types';

let transporter: Transporter | null = null;
let transporterFor = '';

function getTransporter(): Transporter {
	const { smtp } = getConfig();
	const key = `${smtp.host}:${smtp.port}:${smtp.user}`;
	if (transporter && transporterFor === key) return transporter;

	transporter = nodemailer.createTransport({
		host: smtp.host,
		port: smtp.port,
		// 465 is implicit TLS; 587 upgrades with STARTTLS. Both are encrypted.
		secure: smtp.port === 465,
		auth: { user: smtp.user, pass: smtp.appPassword },
		pool: true,
		maxConnections: 1,
		maxMessages: 50
	});
	transporterFor = key;
	return transporter;
}

/** Drops the pooled connection; called after the settings change. */
export function resetTransporter(): void {
	transporter?.close();
	transporter = null;
	transporterFor = '';
}

export function isMailConfigured(): boolean {
	const { smtp } = getConfig();
	return Boolean(smtp.user && smtp.appPassword);
}

function fromAddress(): string {
	const { smtp } = getConfig();
	// The display name is quoted so a name containing a comma cannot split the header
	// into two addresses.
	return `"${smtp.fromName.replace(/"/g, '')}" <${smtp.user}>`;
}

export interface SendResult {
	householdId: string;
	householdName: string;
	email: string | null;
	status: 'sent' | 'failed' | 'skipped';
	error?: string;
}

export interface Message {
	subject: string;
	html: string;
	text: string;
	/**
	 * Images embedded in the message body rather than linked.
	 *
	 * An invitation's QR code has to be *in* the email: most clients block remote
	 * images by default, and a blocked QR code is an invitation with nothing on it.
	 * Attaching it with a content id and referencing `cid:` displays without the
	 * recipient having to trust anything.
	 */
	inlineImages?: { cid: string; filename: string; content: Buffer }[];
}

/** Sends one message and writes the log row. Never throws -- it reports. */
export async function sendToHousehold(
	household: Household,
	message: Message,
	templateId: string | null
): Promise<SendResult> {
	const base = { householdId: household.id, householdName: household.name, email: household.email };

	if (!household.email) {
		// Not an error: plenty of households are invited by post only.
		return { ...base, status: 'skipped', error: 'No email address on file.' };
	}
	if (!isMailConfigured()) {
		return { ...base, status: 'failed', error: 'Gmail SMTP is not configured.' };
	}

	try {
		await getTransporter().sendMail({
			from: fromAddress(),
			to: household.email,
			subject: message.subject,
			html: message.html,
			text: message.text,
			attachments: (message.inlineImages ?? []).map((image) => ({
				filename: image.filename,
				content: image.content,
				cid: image.cid,
				// 'inline' rather than 'attachment', so it renders in the body instead of
				// appearing as a file to download.
				contentDisposition: 'inline'
			}))
		});

		recordEmail({
			householdId: household.id,
			templateId,
			subject: message.subject,
			status: 'sent'
		});
		return { ...base, status: 'sent' };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		logError('Reminder email failed', error, { householdId: household.id });
		recordEmail({
			householdId: household.id,
			templateId,
			subject: message.subject,
			status: 'failed',
			error: detail
		});
		return { ...base, status: 'failed', error: detail };
	}
}

/** Small pause between sends, to stay well inside Gmail's rate limits. */
const SEND_GAP_MS = 400;

export async function sendBatch(
	recipients: { household: Household; message: Message }[],
	templateId: string | null
): Promise<SendResult[]> {
	const results: SendResult[] = [];

	for (const [index, recipient] of recipients.entries()) {
		results.push(await sendToHousehold(recipient.household, recipient.message, templateId));
		if (index < recipients.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
		}
	}

	logger.info(
		{
			event: 'email.batch',
			total: results.length,
			sent: results.filter((r) => r.status === 'sent').length,
			failed: results.filter((r) => r.status === 'failed').length,
			skipped: results.filter((r) => r.status === 'skipped').length
		},
		'reminder batch finished'
	);

	return results;
}

/** Proves the credentials work, from the Settings screen, without spamming anybody. */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
	if (!isMailConfigured()) return { ok: false, error: 'Set GMAIL_USER and GMAIL_APP_PASSWORD first.' };

	try {
		const transport = getTransporter();
		await transport.verify();
		await transport.sendMail({
			from: fromAddress(),
			to,
			subject: 'Test email from your wedding RSVP site',
			text: 'If you are reading this, Gmail SMTP is configured correctly.',
			html: '<p>If you are reading this, Gmail SMTP is configured correctly.</p>'
		});
		return { ok: true };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		logError('Test email failed', error);
		return { ok: false, error: detail };
	}
}
