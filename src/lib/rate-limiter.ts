/**
 * Reusable sliding-window rate limiter.
 *
 * Tracks timestamps per key in a Map. Prunes expired timestamps
 * on each check. Optionally supports a lockout duration: when
 * `lockoutMs` is set and the limit is exceeded, the key is locked
 * for that duration regardless of the sliding window.
 */

export interface RateLimiterConfig {
  maxActions: number;
  windowMs: number;
  /**
   * Optional lockout duration. When set, after `maxActions` are reached the
   * key is locked for this many milliseconds — even if the sliding window
   * would otherwise have freed up a slot.
   */
  lockoutMs?: number;
}

export class SlidingWindowLimiter {
  private readonly maxActions: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number | undefined;
  private readonly timestamps: Map<string, number[]> = new Map();
  private readonly lockouts: Map<string, number> = new Map();

  constructor(config: RateLimiterConfig) {
    this.maxActions = config.maxActions;
    this.windowMs = config.windowMs;
    this.lockoutMs = config.lockoutMs;
  }

  /**
   * Check whether the given key is allowed to perform an action.
   * Prunes expired timestamps before counting.
   */
  check(key: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();

    // Check active lockout first
    const lockedUntil = this.lockouts.get(key);
    if (lockedUntil !== undefined) {
      if (now < lockedUntil) {
        return { allowed: false, retryAfterMs: lockedUntil - now };
      }
      // Lockout expired — clear it and the timestamps
      this.lockouts.delete(key);
      this.timestamps.delete(key);
    }

    const entries = this.timestamps.get(key);

    if (!entries || entries.length === 0) {
      return { allowed: true };
    }

    // Prune timestamps outside the window
    const windowStart = now - this.windowMs;
    const valid = entries.filter((ts) => ts > windowStart);
    this.timestamps.set(key, valid);

    if (valid.length < this.maxActions) {
      return { allowed: true };
    }

    // Apply lockout if configured
    if (this.lockoutMs) {
      const lockUntil = now + this.lockoutMs;
      this.lockouts.set(key, lockUntil);
      return { allowed: false, retryAfterMs: this.lockoutMs };
    }

    // The oldest timestamp in the window determines when the next slot opens
    const oldestInWindow = valid[0];
    const retryAfterMs = oldestInWindow + this.windowMs - now;

    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1) };
  }

  /**
   * Record an action for the given key (adds current timestamp).
   */
  record(key: string): void {
    const entries = this.timestamps.get(key) ?? [];
    entries.push(Date.now());
    this.timestamps.set(key, entries);
  }

  /**
   * Reset (clear) all timestamps for the given key.
   */
  reset(key: string): void {
    this.timestamps.delete(key);
    this.lockouts.delete(key);
  }
}
