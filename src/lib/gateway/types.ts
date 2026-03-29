/**
 * Type definitions for the OpenClaw gateway API.
 */

export interface GatewayHealthResponse {
  status: 'healthy' | 'unhealthy';
  version?: string;
}

export interface GatewayAgentStatus {
  id: string;
  name: string;
  status: string;
  model: string;
  activeSessionId?: string;
}

export interface ApprovalRequest {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  context: string;
  requestedAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}
