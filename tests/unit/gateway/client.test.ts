/**
 * Unit tests for the OpenClaw gateway HTTP client.
 *
 * Mocks the global fetch to test all gateway client functions
 * without a real gateway running.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock fetch globally ──────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  mockFetch.mockReset();
});

// ── Import after mock setup ──────────────────────────────────────────────

import {
  gatewayRequest,
  GatewayError,
  isGatewayAvailable,
  controlAgent,
  sendMessage,
  swapModel,
  listApprovals,
  respondToApproval,
} from '@/lib/gateway/client';

// ── Helpers ──────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

function errorResponse(body: string, status = 500): Response {
  return new Response(body, { status });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Gateway Client', () => {
  describe('isGatewayAvailable', () => {
    it('returns true when gateway responds with healthy status', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ status: 'healthy', version: '1.0.0' }),
      );

      const result = await isGatewayAvailable();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/health'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns false when gateway responds with unhealthy status', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ status: 'unhealthy' }),
      );

      const result = await isGatewayAvailable();
      expect(result).toBe(false);
    });

    it('returns false when fetch throws (gateway offline)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await isGatewayAvailable();
      expect(result).toBe(false);
    });
  });

  describe('controlAgent', () => {
    it('sends POST to /agents/:id/control with action body', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await controlAgent('agent-1', 'start');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/agent-1/control'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'start' }),
        }),
      );
    });

    it('handles stop action', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await expect(controlAgent('agent-1', 'stop')).resolves.toBeUndefined();
    });

    it('handles restart action', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await expect(controlAgent('agent-1', 'restart')).resolves.toBeUndefined();
    });
  });

  describe('sendMessage', () => {
    it('sends POST to /agents/:id/message with message body', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await sendMessage('agent-1', 'Hello, agent!');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/agent-1/message'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'Hello, agent!' }),
        }),
      );
    });
  });

  describe('swapModel', () => {
    it('sends PATCH to /agents/:id/model with model body', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await swapModel('agent-1', 'claude-3-opus');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/agent-1/model'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ model: 'claude-3-opus' }),
        }),
      );
    });
  });

  describe('listApprovals', () => {
    it('parses response into ApprovalRequest array', async () => {
      const approvals = [
        {
          id: 'apr-1',
          agentId: 'agent-1',
          agentName: 'Agent One',
          action: 'deploy',
          context: 'Deploying to production',
          requestedAt: '2026-01-01T00:00:00Z',
          expiresAt: '2026-01-01T01:00:00Z',
          status: 'pending',
        },
      ];

      mockFetch.mockResolvedValueOnce(jsonResponse(approvals));

      const result = await listApprovals();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('apr-1');
      expect(result[0].agentId).toBe('agent-1');
      expect(result[0].status).toBe('pending');
    });

    it('returns empty array when no approvals', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const result = await listApprovals();
      expect(result).toEqual([]);
    });
  });

  describe('respondToApproval', () => {
    it('sends correct body for approve action', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await respondToApproval('apr-1', 'approve', 'Looks good');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/approvals/apr-1'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'approve', note: 'Looks good' }),
        }),
      );
    });

    it('sends correct body for deny action without note', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await respondToApproval('apr-1', 'deny');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/approvals/apr-1'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'deny', note: undefined }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('throws GatewayError on non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse('{"error":"not found"}', 404),
      );

      try {
        await gatewayRequest('/agents/bad-id/control', 'POST', { action: 'start' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GatewayError);
        const ge = err as GatewayError;
        expect(ge.status).toBe(404);
        expect(ge.body).toBe('{"error":"not found"}');
        expect(ge.message).toContain('404');
      }
    });

    it('throws on fetch failure (gateway offline)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        controlAgent('agent-1', 'start'),
      ).rejects.toThrow('ECONNREFUSED');
    });

    it('throws on timeout (AbortController fires)', async () => {
      // Simulate a fetch that takes too long — AbortController aborts it
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            // Simulate abort by rejecting after a short delay
            setTimeout(() => {
              const abortError = new DOMException('The operation was aborted.', 'AbortError');
              reject(abortError);
            }, 10);
          }),
      );

      await expect(
        controlAgent('agent-1', 'start'),
      ).rejects.toThrow();
    });

    it('throws GatewayError on 500 response', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse('Internal Server Error', 500),
      );

      await expect(
        sendMessage('agent-1', 'hello'),
      ).rejects.toThrow(GatewayError);
    });
  });

  describe('gatewayRequest', () => {
    it('passes AbortController signal to fetch', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await gatewayRequest('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('sets Content-Type header when body is provided', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await gatewayRequest('/test', 'POST', { data: 'value' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('does not set Content-Type header when no body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await gatewayRequest('/test');

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['Content-Type']).toBeUndefined();
    });
  });
});
