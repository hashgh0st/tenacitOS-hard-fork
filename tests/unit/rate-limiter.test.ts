/**
 * Unit tests for the sliding-window rate limiter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlidingWindowLimiter } from '@/lib/rate-limiter';

describe('SlidingWindowLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to maxActions within the window', () => {
    const limiter = new SlidingWindowLimiter({ maxActions: 3, windowMs: 60_000 });

    for (let i = 0; i < 3; i++) {
      const result = limiter.check('user1');
      expect(result.allowed).toBe(true);
      limiter.record('user1');
    }
  });

  it('blocks action #(maxActions+1)', () => {
    const limiter = new SlidingWindowLimiter({ maxActions: 3, windowMs: 60_000 });

    for (let i = 0; i < 3; i++) {
      limiter.record('user1');
    }

    const result = limiter.check('user1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeDefined();
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('returns correct retryAfterMs', () => {
    const limiter = new SlidingWindowLimiter({ maxActions: 2, windowMs: 60_000 });

    // Record first action at t=0
    limiter.record('user1');

    // Advance 20 seconds
    vi.advanceTimersByTime(20_000);

    // Record second action at t=20s
    limiter.record('user1');

    // Now at t=20s, both actions are within the window
    const result = limiter.check('user1');
    expect(result.allowed).toBe(false);
    // Oldest entry is at t=0, so retry after (0 + 60_000 - 20_000) = 40_000ms
    expect(result.retryAfterMs).toBe(40_000);
  });

  it('allows again after enough time passes (window slides)', () => {
    const limiter = new SlidingWindowLimiter({ maxActions: 2, windowMs: 60_000 });

    limiter.record('user1');
    limiter.record('user1');

    // At t=0, should be blocked
    expect(limiter.check('user1').allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(60_001);

    // Now the window has slid past both timestamps
    const result = limiter.check('user1');
    expect(result.allowed).toBe(true);
  });

  it('reset() clears a key', () => {
    const limiter = new SlidingWindowLimiter({ maxActions: 1, windowMs: 60_000 });

    limiter.record('user1');
    expect(limiter.check('user1').allowed).toBe(false);

    limiter.reset('user1');
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('different keys are independent', () => {
    const limiter = new SlidingWindowLimiter({ maxActions: 1, windowMs: 60_000 });

    limiter.record('user1');

    // user1 is blocked
    expect(limiter.check('user1').allowed).toBe(false);

    // user2 is still allowed
    expect(limiter.check('user2').allowed).toBe(true);
  });

  it('returns allowed=true for keys with no history', () => {
    const limiter = new SlidingWindowLimiter({ maxActions: 5, windowMs: 60_000 });
    const result = limiter.check('unknown-key');
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBeUndefined();
  });

  it('prunes expired timestamps on check', () => {
    const limiter = new SlidingWindowLimiter({ maxActions: 2, windowMs: 10_000 });

    // Record 2 actions at t=0
    limiter.record('user1');
    limiter.record('user1');
    expect(limiter.check('user1').allowed).toBe(false);

    // Advance 5 seconds — first action still in window
    vi.advanceTimersByTime(5_000);
    expect(limiter.check('user1').allowed).toBe(false);

    // Advance 6 more seconds (total 11s) — both actions expired
    vi.advanceTimersByTime(6_000);
    expect(limiter.check('user1').allowed).toBe(true);
  });
});
