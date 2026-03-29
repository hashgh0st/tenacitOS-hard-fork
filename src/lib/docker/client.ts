/**
 * Docker Engine API client.
 *
 * Communicates with Docker via raw HTTP over Unix socket or TCP.
 * No shell execution — all interaction is through the Docker Engine REST API.
 *
 * Connection method is determined by the DOCKER_HOST env var:
 *   - Not set + no local socket → state: not_configured
 *   - unix:///path/to/socket     → http.request({ socketPath })
 *   - tcp://host:port            → http.request({ hostname, port })
 *   - SSH tunnels: out of scope for now (future enhancement)
 *
 * Also supports legacy DOCKER_SOCKET env var for backwards compatibility.
 */
import http from 'http';
import type {
  DockerContainer,
  DockerImage,
  DockerSystemInfo,
  DockerDiskUsage,
  DockerState,
} from './types';

const DEFAULT_SOCKET = '/var/run/docker.sock';
const REQUEST_TIMEOUT_MS = 5000;
const STATE_CACHE_TTL_MS = 30_000;

// ── Connection config ─────────────────────────────────────────────────────

interface SocketConnection {
  type: 'socket';
  socketPath: string;
}

interface TcpConnection {
  type: 'tcp';
  hostname: string;
  port: number;
}

type DockerConnection = SocketConnection | TcpConnection | null;

/**
 * Parse DOCKER_HOST (or legacy DOCKER_SOCKET) to determine connection method.
 * Returns null if Docker is not configured.
 */
export function parseDockerHost(): DockerConnection {
  const dockerHost = process.env.DOCKER_HOST;
  const dockerSocket = process.env.DOCKER_SOCKET;

  if (dockerHost) {
    if (dockerHost.startsWith('unix://')) {
      return { type: 'socket', socketPath: dockerHost.slice('unix://'.length) };
    }
    if (dockerHost.startsWith('tcp://')) {
      const url = new URL(dockerHost.replace('tcp://', 'http://'));
      return {
        type: 'tcp',
        hostname: url.hostname,
        port: parseInt(url.port, 10) || 2375,
      };
    }
    // Unsupported scheme (e.g. ssh://) — treat as not configured for now
    return null;
  }

  if (dockerSocket) {
    return { type: 'socket', socketPath: dockerSocket };
  }

  // Check for default socket path existence is deferred to getDockerState()
  // because we don't want to do filesystem I/O at module load time.
  // Return default socket config — availability will be checked at request time.
  return { type: 'socket', socketPath: DEFAULT_SOCKET };
}

// ── Core HTTP function ────────────────────────────────────────────────────

/**
 * Make a raw HTTP request to the Docker Engine API.
 * Throws on timeout, connection errors, or non-2xx status.
 */
export function dockerRequest<T>(
  path: string,
  method: string = 'GET',
  body?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const conn = parseDockerHost();
    if (!conn) {
      reject(new Error('Docker is not configured'));
      return;
    }

    const bodyStr = body != null ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {};
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }

    const options: http.RequestOptions = {
      path,
      method,
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    };

    if (conn.type === 'socket') {
      options.socketPath = conn.socketPath;
    } else {
      options.hostname = conn.hostname;
      options.port = conn.port;
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(raw ? (JSON.parse(raw) as T) : (undefined as unknown as T));
          } catch {
            // Some endpoints (e.g. start/stop) return empty 204
            resolve(undefined as unknown as T);
          }
        } else {
          let message = `Docker API ${method} ${path} returned ${res.statusCode}`;
          try {
            const parsed = JSON.parse(raw) as { message?: string };
            if (parsed.message) message = parsed.message;
          } catch {
            // Use default message
          }
          reject(new Error(message));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Docker API request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });

    req.on('error', (err) => {
      reject(new Error(`Docker connection error: ${err.message}`));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// ── State / availability ──────────────────────────────────────────────────

let cachedState: DockerState | null = null;
let cacheTimestamp = 0;

/**
 * Reset the cached Docker state (for testing).
 */
export function resetStateCache(): void {
  cachedState = null;
  cacheTimestamp = 0;
}

/**
 * Get the current Docker connection state with 30-second caching.
 */
export async function getDockerState(): Promise<DockerState> {
  const now = Date.now();
  if (cachedState !== null && now - cacheTimestamp < STATE_CACHE_TTL_MS) {
    return cachedState;
  }

  const conn = parseDockerHost();
  if (!conn) {
    cachedState = 'not_configured';
    cacheTimestamp = now;
    return cachedState;
  }

  try {
    await dockerRequest<{ ApiVersion: string }>('/version');
    cachedState = 'available';
  } catch {
    // If DOCKER_HOST was explicitly set but unreachable, report unreachable.
    // If using default socket and it doesn't exist, report not_configured.
    const isExplicit = !!(process.env.DOCKER_HOST || process.env.DOCKER_SOCKET);
    cachedState = isExplicit ? 'unreachable' : 'not_configured';
  }

  cacheTimestamp = now;
  return cachedState;
}

/**
 * Convenience wrapper: is Docker available right now?
 */
export async function isDockerAvailable(): Promise<boolean> {
  return (await getDockerState()) === 'available';
}

// ── Container operations ──────────────────────────────────────────────────

export function listContainers(): Promise<DockerContainer[]> {
  return dockerRequest<DockerContainer[]>('/containers/json?all=true');
}

export async function containerAction(
  id: string,
  action: 'start' | 'stop' | 'restart',
): Promise<void> {
  await dockerRequest<void>(`/containers/${id}/${action}`, 'POST');
}

/**
 * Get container logs. Returns the raw log text.
 * Docker multiplexes stdout/stderr in a binary frame format for non-tty containers.
 * We strip the 8-byte header from each frame to return clean text.
 */
export function getContainerLogs(id: string, tail: number = 100): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = parseDockerHost();
    if (!conn) {
      reject(new Error('Docker is not configured'));
      return;
    }

    const path = `/containers/${id}/logs?stdout=1&stderr=1&tail=${tail}`;
    const options: http.RequestOptions = {
      path,
      method: 'GET',
      timeout: REQUEST_TIMEOUT_MS,
    };

    if (conn.type === 'socket') {
      options.socketPath = conn.socketPath;
    } else {
      options.hostname = conn.hostname;
      options.port = conn.port;
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const raw = Buffer.concat(chunks);
          resolve(stripDockerLogHeaders(raw));
        } else {
          reject(new Error(`Docker logs request failed with status ${res.statusCode}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Docker logs request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.on('error', (err) => {
      reject(new Error(`Docker connection error: ${err.message}`));
    });
    req.end();
  });
}

/**
 * Strip Docker stream multiplexing headers (8-byte prefix per frame).
 * Format: [stream_type(1) | padding(3) | size(4 big-endian)] + payload
 *
 * Stream type must be 0 (stdin), 1 (stdout), or 2 (stderr).
 * If the first byte doesn't match a valid stream type, the buffer
 * is assumed to be TTY mode output (raw text without framing).
 */
export function stripDockerLogHeaders(buf: Buffer): string {
  if (buf.length === 0) return '';

  // Check if this looks like multiplexed output by examining the first byte.
  // Valid Docker stream types: 0 (stdin), 1 (stdout), 2 (stderr).
  // Padding bytes (1-3) should be zero in valid frames.
  const firstByte = buf[0];
  if (firstByte > 2 || buf.length < 8 || buf[1] !== 0 || buf[2] !== 0 || buf[3] !== 0) {
    // Not multiplexed — return raw text (TTY mode)
    return buf.toString('utf-8');
  }

  const lines: string[] = [];
  let offset = 0;

  while (offset + 8 <= buf.length) {
    const streamType = buf[offset];
    // Validate stream type for each frame
    if (streamType > 2 || buf[offset + 1] !== 0 || buf[offset + 2] !== 0 || buf[offset + 3] !== 0) {
      // Remaining data doesn't look like a valid frame; append as raw
      lines.push(buf.subarray(offset).toString('utf-8'));
      break;
    }
    const frameSize = buf.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = Math.min(start + frameSize, buf.length);
    if (start < buf.length) {
      lines.push(buf.subarray(start, end).toString('utf-8'));
    }
    offset = end;
  }

  return lines.join('');
}

// ── Image operations ──────────────────────────────────────────────────────

export function listImages(): Promise<DockerImage[]> {
  return dockerRequest<DockerImage[]>('/images/json');
}

// ── System info ───────────────────────────────────────────────────────────

interface DockerVersionResponse {
  Version: string;
  ApiVersion: string;
}

interface DockerInfoResponse {
  Containers: number;
  ContainersRunning: number;
  ContainersStopped: number;
  Images: number;
}

export async function getSystemInfo(): Promise<DockerSystemInfo> {
  const [version, info] = await Promise.all([
    dockerRequest<DockerVersionResponse>('/version'),
    dockerRequest<DockerInfoResponse>('/info'),
  ]);

  return {
    ServerVersion: version.Version,
    Containers: info.Containers,
    ContainersRunning: info.ContainersRunning,
    ContainersStopped: info.ContainersStopped,
    Images: info.Images,
  };
}

// ── Disk usage ────────────────────────────────────────────────────────────

export function getDiskUsage(): Promise<DockerDiskUsage> {
  return dockerRequest<DockerDiskUsage>('/system/df');
}

// ── Prune operations ──────────────────────────────────────────────────────

export interface PruneContainersResult {
  ContainersDeleted: string[] | null;
  SpaceReclaimed: number;
}

export interface PruneImagesResult {
  ImagesDeleted: Array<{ Deleted?: string; Untagged?: string }> | null;
  SpaceReclaimed: number;
}

export function pruneContainers(): Promise<PruneContainersResult> {
  return dockerRequest<PruneContainersResult>('/containers/prune', 'POST');
}

export function pruneImages(): Promise<PruneImagesResult> {
  return dockerRequest<PruneImagesResult>('/images/prune', 'POST');
}

// ── Streaming logs (for SSE) ──────────────────────────────────────────────

/**
 * Open a streaming connection to Docker container logs.
 * Returns the raw http.IncomingMessage for piping to an SSE response.
 * Caller is responsible for cleanup.
 */
export function streamContainerLogs(
  id: string,
  tail: number = 100,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const conn = parseDockerHost();
    if (!conn) {
      reject(new Error('Docker is not configured'));
      return;
    }

    const path = `/containers/${id}/logs?follow=true&stdout=1&stderr=1&tail=${tail}`;
    const options: http.RequestOptions = {
      path,
      method: 'GET',
      // No timeout for streaming — caller manages lifecycle
    };

    if (conn.type === 'socket') {
      options.socketPath = conn.socketPath;
    } else {
      options.hostname = conn.hostname;
      options.port = conn.port;
    }

    const req = http.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res);
      } else {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          reject(new Error(`Docker logs stream failed: ${res.statusCode} ${raw}`));
        });
      }
    });

    req.on('error', (err) => {
      reject(new Error(`Docker connection error: ${err.message}`));
    });

    req.end();
  });
}
