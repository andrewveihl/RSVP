/**
 * Central environment-variable access.
 *
 * Every value is read from `process.env` on demand rather than captured at module
 * load. That keeps unit tests able to flip a variable between cases, and it means a
 * container restart is enough to pick up an edited `.env` -- no rebuild.
 *
 * Nothing here throws at import time. A misconfigured value should never stop the
 * site from booting and taking a guest's RSVP.
 */

const DEFAULTS = {
	/**
	 * Guests arrive one at a time from home, not as a room full of phones behind one
	 * venue NAT, so a genuinely tight per-IP budget is affordable here. The brief asks
	 * for 20/min on the RSVP endpoint.
	 */
	RATE_LIMIT_MAX: 20,
	RATE_LIMIT_WINDOW_MS: 60_000,
	/** Browsing the public site is not the thing we are trying to slow down. */
	PAGE_RATE_LIMIT_MAX: 240,
	ADMIN_LOGIN_MAX: 5,
	ADMIN_LOGIN_WINDOW_MS: 15 * 60 * 1000,
	/** Inactivity timeout for the admin session, per the brief's default. */
	ADMIN_SESSION_TTL_MS: 30 * 60 * 1000,
	DATABASE_PATH: '/data/wedding-rsvp.db',
	BACKUP_DIR: '/backups',
	BACKUP_RETENTION_DAYS: 30,
	WEDDING_DATE: '2027-05-29',
	COUPLE_NAMES: 'Andrew & Madeline'
} as const;

function str(name: string, fallback = ''): string {
	const value = process.env[name];
	return value === undefined || value === '' ? fallback : value;
}

function int(name: string, fallback: number): number {
	const parsed = Number.parseInt(process.env[name] ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface SmtpConfig {
	user: string;
	appPassword: string;
	fromName: string;
	host: string;
	port: number;
}

export interface AppConfig {
	databasePath: string;
	adminPassword: string;
	rateLimit: { max: number; windowMs: number };
	pageRateLimit: { max: number; windowMs: number };
	/** Much tighter budget for password guessing than for anything guest-facing. */
	adminLoginRateLimit: { max: number; windowMs: number };
	adminSessionTtlMs: number;
	/** ISO timestamp; a *soft* lock -- the admin can still record a late RSVP. */
	rsvpDeadline: string;
	weddingDate: string;
	coupleNames: string;
	/** Address printed on the "we couldn't find you" fallback and in reminders. */
	contactEmail: string;
	/** Public URL of the guest site. QR codes and invitations point here. */
	siteUrl: string;
	/** Public URL of the admin app, on its own subdomain. */
	adminUrl: string;
	smtp: SmtpConfig;
	backupDir: string;
	backupRetentionDays: number;
	nodeEnv: string;
	port: number;
	logLevel: string;
}

export function getConfig(): AppConfig {
	return {
		databasePath: str('DATABASE_PATH', DEFAULTS.DATABASE_PATH),
		adminPassword: str('ADMIN_PASSWORD'),
		rateLimit: {
			max: int('RATE_LIMIT_MAX', DEFAULTS.RATE_LIMIT_MAX),
			windowMs: int('RATE_LIMIT_WINDOW_MS', DEFAULTS.RATE_LIMIT_WINDOW_MS)
		},
		pageRateLimit: {
			max: int('PAGE_RATE_LIMIT_MAX', DEFAULTS.PAGE_RATE_LIMIT_MAX),
			windowMs: int('RATE_LIMIT_WINDOW_MS', DEFAULTS.RATE_LIMIT_WINDOW_MS)
		},
		adminLoginRateLimit: {
			max: int('ADMIN_LOGIN_RATE_LIMIT_MAX', DEFAULTS.ADMIN_LOGIN_MAX),
			windowMs: int('ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS', DEFAULTS.ADMIN_LOGIN_WINDOW_MS)
		},
		adminSessionTtlMs: int('ADMIN_SESSION_TTL_MS', DEFAULTS.ADMIN_SESSION_TTL_MS),
		rsvpDeadline: str('RSVP_DEADLINE'),
		weddingDate: str('WEDDING_DATE', DEFAULTS.WEDDING_DATE),
		coupleNames: str('COUPLE_NAMES', DEFAULTS.COUPLE_NAMES),
		contactEmail: str('CONTACT_EMAIL', str('GMAIL_USER')),
		siteUrl: str('PUBLIC_SITE_URL', 'http://localhost:5173'),
		adminUrl: str('PUBLIC_ADMIN_URL', 'http://localhost:5174'),
		smtp: {
			user: str('GMAIL_USER'),
			appPassword: str('GMAIL_APP_PASSWORD'),
			fromName: str('GMAIL_FROM_NAME', DEFAULTS.COUPLE_NAMES),
			host: str('SMTP_HOST', 'smtp.gmail.com'),
			port: int('SMTP_PORT', 465)
		},
		backupDir: str('BACKUP_DIR', DEFAULTS.BACKUP_DIR),
		backupRetentionDays: int('BACKUP_RETENTION_DAYS', DEFAULTS.BACKUP_RETENTION_DAYS),
		nodeEnv: str('NODE_ENV', 'development'),
		port: int('PORT', 3000),
		logLevel: str('LOG_LEVEL', 'info')
	};
}

/**
 * The RSVP deadline as a Date, or null when none is configured or the configured
 * value is unparseable.
 *
 * A malformed deadline must never read as "closed": that would silently stop every
 * guest from replying, which is far worse than accepting a few late responses.
 */
export function rsvpDeadlineDate(deadline = getConfig().rsvpDeadline): Date | null {
	const raw = deadline.trim();
	if (!raw) return null;
	// A bare date means "the end of that day", not midnight at its start.
	const normalised = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999` : raw;
	const parsed = new Date(normalised);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** True once the RSVP deadline has passed. Soft: the admin can still record replies. */
export function isRsvpClosed(now: Date = new Date(), deadline?: string): boolean {
	const cutoff = rsvpDeadlineDate(deadline ?? getConfig().rsvpDeadline);
	if (!cutoff) return false;
	return now.getTime() > cutoff.getTime();
}

/** The wedding date as a Date at local midnight, or null when unset/unparseable. */
export function weddingDateValue(value = getConfig().weddingDate): Date | null {
	const raw = value.trim();
	if (!raw) return null;
	const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The set of origins a state-changing request is allowed to come from. */
export function allowedOrigins(): string[] {
	const origins = new Set<string>();
	const config = getConfig();

	// Both public URLs are trusted: the two apps are halves of one deployment, and
	// each must accept requests aimed at itself.
	for (const url of [config.siteUrl, config.adminUrl]) {
		if (!url) continue;
		try {
			origins.add(new URL(url).origin);
		} catch {
			// Ignore an unparseable URL; the request's own origin is still accepted.
		}
	}
	for (const extra of str('EXTRA_ALLOWED_ORIGINS').split(',')) {
		const trimmed = extra.trim();
		if (trimmed) origins.add(trimmed.replace(/\/$/, ''));
	}
	return [...origins];
}
