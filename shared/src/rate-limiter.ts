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
 * Resolves the real client IP. nginx sets X-Forwarded-For; we take the left-most
 * entry, which is the original client, and fall back to Kit's socket address.
 */
export function resolveClientIp(request: Request, fallback: () => string): string {
	const forwarded = request.headers.get('x-forwarded-for');
	if (forwarded) {
		const first = forwarded.split(',')[0]?.trim();
		if (first) return first;
	}
	const realIp = request.headers.get('x-real-ip');
	if (realIp) return realIp.trim();
	try {
		return fallback();
	} catch {
		return 'unknown';
	}
}
