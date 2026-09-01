/**
 * Structured JSON logging to stdout/stderr for Docker to collect.
 */
import pino from 'pino';
import { getConfig } from './config';

export const logger = pino({
	level: getConfig().logLevel,
	base: { app: 'wedding-rsvp' },
	timestamp: pino.stdTimeFunctions.isoTime,
	formatters: {
		level: (label) => ({ level: label })
	},
	redact: {
		paths: [
			'req.headers.cookie',
			'req.headers.authorization',
			'password',
			'appPassword',
			'GMAIL_APP_PASSWORD'
		],
		censor: '[redacted]'
	}
});

/** Errors are logged with the full stack so a container log is enough to debug. */
export function logError(message: string, error: unknown, extra: Record<string, unknown> = {}): void {
	const err = error instanceof Error ? error : new Error(String(error));
	logger.error({ ...extra, err: { message: err.message, stack: err.stack, name: err.name } }, message);
}
