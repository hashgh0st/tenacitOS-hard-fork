/**
 * Reusable sliding-window rate limiter.
 *
 * Tracks timestamps per key in a Map. Unlike the login limiter,
 * there is no lockout — just a sliding window that prunes expired
 * timestamps on each check.
 */

export interface RateLimiterConfig {
  maxActions: number;
  windowMs: number;
}

export class SlidingWindowLimiter {
  private readonly maxActions: number;
  private readonly windowMs: number;
  private readonly timestamps: Map<string, number[]> = new Map();

  constructor(config: RateLimiterConfig) {
    this.maxActions = config.maxActions;
    this.windowMs = config.windowMs;
  }

  /**
   * Check whether the given key is allowed to perform an action.
   * Prunes expired timestamps before counting.
   */
  check(key: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
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
  }
}
