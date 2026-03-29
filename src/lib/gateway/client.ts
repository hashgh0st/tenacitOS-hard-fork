/**
 * OpenClaw gateway HTTP client.
 *
 * Communicates with the gateway service for agent lifecycle control
 * and approval management. All functions throw GatewayError on non-2xx
 * responses.
 */
import type {
  GatewayHealthResponse,
  ApprovalRequest,
} from '@/lib/gateway/types';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3001';
const REQUEST_TIMEOUT_MS = 5_000;

// ── Error class ──────────────────────────────────────────────────────────

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

// ── Internal fetch wrapper ───────────────────────────────────────────────

export async function gatewayRequest<T>(
  path: string,
  method: string = 'GET',
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${GATEWAY_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new GatewayError(
        `Gateway returned ${res.status}`,
        res.status,
        text,
      );
    }

    // 204 No Content — nothing to parse
    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Check whether the gateway is reachable and healthy.
 */
export async function isGatewayAvailable(): Promise<boolean> {
  try {
    const data = await gatewayRequest<GatewayHealthResponse>('/health');
    return data?.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Send a lifecycle control command to an agent.
 */
export async function controlAgent(
  id: string,
  action: 'start' | 'stop' | 'restart',
): Promise<void> {
  await gatewayRequest<void>(`/agents/${id}/control`, 'POST', { action });
}

/**
 * Send a message to an agent.
 */
export async function sendMessage(
  agentId: string,
  message: string,
): Promise<void> {
  await gatewayRequest<void>(`/agents/${agentId}/message`, 'POST', { message });
}

/**
 * Hot-swap an agent's model.
 */
export async function swapModel(
  agentId: string,
  model: string,
): Promise<void> {
  await gatewayRequest<void>(`/agents/${agentId}/model`, 'PATCH', { model });
}

/**
 * List all pending approval requests.
 */
export async function listApprovals(): Promise<ApprovalRequest[]> {
  return gatewayRequest<ApprovalRequest[]>('/approvals');
}

/**
 * Approve or deny a pending approval request.
 */
export async function respondToApproval(
  id: string,
  action: 'approve' | 'deny',
  note?: string,
): Promise<void> {
  await gatewayRequest<void>(`/approvals/${id}`, 'POST', { action, note });
}
