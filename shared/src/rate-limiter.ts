/**
 * Per-IP fixed-window rate limiting backed by an in-memory Map.
 *
 * One container serves one wedding, so there is nothing to share across processes and
 * no reason to pull in Redis. Expired buckets are swept lazily on each call plus on a
 * slow interval, keeping the Map from growing without bound.
 */
import { getConfig } from './config';

interface Bucket {
	count: number;
	resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number): void {
	if (now - lastSweep < SWEEP_INTERVAL_MS) return;
	lastSweep = now;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

export interface RateLimitOptions {
	max?: number;
	windowMs?: number;
	now?: number;
}

export interface RateLimitResult {
	allowed: boolean;
	limit: number;
	remaining: number;
	resetAt: number;
	/** Seconds until the window resets; surfaced as the Retry-After header. */
	retryAfter: number;
}

export function checkRateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
	const cfg = getConfig().rateLimit;
	const max = options.max ?? cfg.max;
	const windowMs = options.windowMs ?? cfg.windowMs;
	const now = options.now ?? Date.now();

	sweep(now);

	let bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		bucket = { count: 0, resetAt: now + windowMs };
		buckets.set(key, bucket);
	}

	const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

	if (bucket.count >= max) {
		return { allowed: false, limit: max, remaining: 0, resetAt: bucket.resetAt, retryAfter };
	}

	bucket.count += 1;
	return {
		allowed: true,
		limit: max,
		remaining: Math.max(0, max - bucket.count),
		resetAt: bucket.resetAt,
		retryAfter
	};
}

/** Test helper -- drops all state so cases don't leak into one another. */
export function resetRateLimiter(): void {
	buckets.clear();
	lastSweep = 0;
}

export function rateLimiterSize(): number {
	return buckets.size;
}

/**
 * Resolves the client IP that rate limits are counted against.
 *
 * X-Forwarded-For is a chain each proxy appends to, so the right-most entry is the
 * peer *our* nginx actually saw and everything left of it is unverifiable -- it is
 * whatever the client sent, and nginx appended to rather than replaced.
 *
 * Reading the left-most entry, as this used to, therefore let anyone pick their own
 * rate-limit bucket: a fresh `X-Forwarded-For: 203.0.113.<n>` on each request bought
 * a fresh budget, which made the admin login's five-attempts-per-quarter-hour cap
 * unlimited. So we count `trustedProxyHops` entries in from the right and refuse to
 * look any further left. With one nginx that is the last entry; with none (the app
 * exposed directly, or the E2E suite) the header is ignored entirely.
 */
export function resolveClientIp(request: Request, fallback: () => string): string {
	const hops = getConfig().trustedProxyHops;

	if (hops > 0) {
		const forwarded = request.headers.get('x-forwarded-for');
		if (forwarded) {
			const chain = forwarded
				.split(',')
				.map((entry) => entry.trim())
				.filter(Boolean);

			// Never index past the start: a short chain means fewer proxies than
			// configured, so the oldest entry we have is the furthest we can trust.
			const trusted = chain[Math.max(0, chain.length - hops)];
			if (trusted) return trusted;
		}

		// nginx *replaces* X-Real-IP with the connecting address rather than appending,
		// so it cannot be forged from outside -- but it only exists behind that proxy.
		const realIp = request.headers.get('x-real-ip');
		if (realIp) return realIp.trim();
	}

	try {
		return fallback();
	} catch {
		return 'unknown';
	}
}
