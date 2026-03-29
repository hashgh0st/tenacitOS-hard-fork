/**
 * Metric resolver registry for the alerting engine.
 *
 * Resolvers cache latest event bus values instead of making fresh system calls.
 * Each resolver has a 3-second Promise.race timeout — if it takes longer, return null.
 */
import { onEvent } from '@/lib/events/bus';
import type { SystemMetrics, CostSnapshot } from '@/lib/events/bus';

// ── Cached metric snapshots ──────────────────────────────────────────────────

let latestMetrics: SystemMetrics | null = null;
let latestCost: CostSnapshot | null = null;

/**
 * Subscribe to event bus events to cache latest metric values.
 * Call once at startup.
 */
export function initResolverSubscriptions(): void {
  onEvent('system:metrics', (m) => {
    latestMetrics = m;
  });
  onEvent('cost:update', (c) => {
    latestCost = c;
  });
}

// ── Resolver map ─────────────────────────────────────────────────────────────

type MetricResolver = () => Promise<number | null>;

export const _resolvers: Record<string, MetricResolver> = {
  'system.cpu': async () => latestMetrics?.cpu ?? null,

  'system.ram': async () => {
    if (!latestMetrics) return null;
    const { total, used } = latestMetrics.ram;
    if (total === 0) return null;
    return (used / total) * 100;
  },

  'system.disk': async () => {
    if (!latestMetrics) return null;
    const { total, used } = latestMetrics.disk;
    if (total === 0) return null;
    return (used / total) * 100;
  },

  'cost.daily.total': async () => latestCost?.periodCost ?? null,

  'gateway.status': async () => {
    try {
      const { isGatewayAvailable } = await import('@/lib/gateway/client');
      const available = await isGatewayAvailable();
      return available ? 1 : 0;
    } catch {
      return 0;
    }
  },
};

// ── Public API ───────────────────────────────────────────────────────────────

const RESOLVER_TIMEOUT_MS = 3_000;

/**
 * Resolve a metric path to a numeric value.
 * Returns null if the metric is unknown, unavailable, or times out.
 */
export async function resolveMetric(metricPath: string): Promise<number | null> {
  const resolver = _resolvers[metricPath];
  if (!resolver) return null;

  try {
    const result = await Promise.race<number | null>([
      resolver(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), RESOLVER_TIMEOUT_MS)),
    ]);
    return result;
  } catch {
    return null;
  }
}

/**
 * Reset cached metrics for testing.
 */
export function _resetMetrics(): void {
  latestMetrics = null;
  latestCost = null;
}

/**
 * Set cached metrics directly for testing.
 */
export function _setLatestMetrics(m: SystemMetrics | null): void {
  latestMetrics = m;
}

export function _setLatestCost(c: CostSnapshot | null): void {
  latestCost = c;
}
