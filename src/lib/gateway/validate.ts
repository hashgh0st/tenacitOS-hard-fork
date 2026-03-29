import { SlidingWindowLimiter } from '@/lib/rate-limiter';

const AGENT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$/;

export function isValidAgentId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && AGENT_ID_RE.test(id);
}

/** Shared rate limiter for all agent control actions — 10 actions/min per user across all agent endpoints. */
export const agentControlLimiter = new SlidingWindowLimiter({ maxActions: 10, windowMs: 60_000 });
