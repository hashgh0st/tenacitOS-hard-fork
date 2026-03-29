/**
 * Tests for src/lib/alerts/resolvers.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveMetric,
  _resolvers,
  _resetMetrics,
  _setLatestMetrics,
  _setLatestCost,
} from '@/lib/alerts/resolvers';
import type { SystemMetrics, CostSnapshot } from '@/lib/events/bus';

describe('Metric Resolvers', () => {
  beforeEach(() => {
    _resetMetrics();
  });

  afterEach(() => {
    _resetMetrics();
  });

  // ── system.cpu ─────────────────────────────────────────────────────────

  it('system.cpu returns cached CPU value', async () => {
    _setLatestMetrics({
      cpu: 75,
      ram: { total: 8e9, used: 4e9, free: 4e9 },
      disk: { total: 100e9, used: 50e9, free: 50e9 },
      network: null,
      pm2Status: null,
    });

    const value = await resolveMetric('system.cpu');
    expect(value).toBe(75);
  });

  it('system.cpu returns null when no metrics available', async () => {
    const value = await resolveMetric('system.cpu');
    expect(value).toBeNull();
  });

  // ── system.ram ─────────────────────────────────────────────────────────

  it('system.ram returns percentage', async () => {
    _setLatestMetrics({
      cpu: 50,
      ram: { total: 8e9, used: 6e9, free: 2e9 },
      disk: { total: 100e9, used: 50e9, free: 50e9 },
      network: null,
      pm2Status: null,
    });

    const value = await resolveMetric('system.ram');
    expect(value).toBe(75); // 6/8 * 100 = 75
  });

  it('system.ram returns null when total is 0', async () => {
    _setLatestMetrics({
      cpu: 50,
      ram: { total: 0, used: 0, free: 0 },
      disk: { total: 100e9, used: 50e9, free: 50e9 },
      network: null,
      pm2Status: null,
    });

    const value = await resolveMetric('system.ram');
    expect(value).toBeNull();
  });

  it('system.ram returns null when no metrics', async () => {
    const value = await resolveMetric('system.ram');
    expect(value).toBeNull();
  });

  // ── system.disk ────────────────────────────────────────────────────────

  it('system.disk returns percentage', async () => {
    _setLatestMetrics({
      cpu: 50,
      ram: { total: 8e9, used: 4e9, free: 4e9 },
      disk: { total: 500e9, used: 400e9, free: 100e9 },
      network: null,
      pm2Status: null,
    });

    const value = await resolveMetric('system.disk');
    expect(value).toBe(80); // 400/500 * 100 = 80
  });

  it('system.disk returns null when total is 0', async () => {
    _setLatestMetrics({
      cpu: 50,
      ram: { total: 8e9, used: 4e9, free: 4e9 },
      disk: { total: 0, used: 0, free: 0 },
      network: null,
      pm2Status: null,
    });

    const value = await resolveMetric('system.disk');
    expect(value).toBeNull();
  });

  // ── cost.daily.total ───────────────────────────────────────────────────

  it('cost.daily.total returns periodCost', async () => {
    _setLatestCost({
      timestamp: Date.now(),
      totalCost: 100,
      periodCost: 8.50,
      byAgent: [],
    });

    const value = await resolveMetric('cost.daily.total');
    expect(value).toBe(8.50);
  });

  it('cost.daily.total returns null when no cost data', async () => {
    const value = await resolveMetric('cost.daily.total');
    expect(value).toBeNull();
  });

  // ── Unknown metric ─────────────────────────────────────────────────────

  it('unknown metric returns null', async () => {
    const value = await resolveMetric('totally.unknown.metric');
    expect(value).toBeNull();
  });

  // ── Timeout handling ───────────────────────────────────────────────────

  it('returns null when resolver times out', async () => {
    // Register a resolver that hangs forever
    const originalResolver = _resolvers['system.cpu'];
    _resolvers['system.cpu'] = () => new Promise(() => {}); // never resolves

    vi.useFakeTimers();

    const promise = resolveMetric('system.cpu');

    // Advance past the 3-second timeout
    await vi.advanceTimersByTimeAsync(3_500);

    const value = await promise;
    expect(value).toBeNull();

    // Restore
    _resolvers['system.cpu'] = originalResolver;
    vi.useRealTimers();
  });

  // ── Resolver map exported for testing ──────────────────────────────────

  it('_resolvers map contains expected keys', () => {
    expect(Object.keys(_resolvers)).toContain('system.cpu');
    expect(Object.keys(_resolvers)).toContain('system.ram');
    expect(Object.keys(_resolvers)).toContain('system.disk');
    expect(Object.keys(_resolvers)).toContain('cost.daily.total');
    expect(Object.keys(_resolvers)).toContain('gateway.status');
  });
});
