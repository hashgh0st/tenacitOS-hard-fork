/**
 * Unit tests for Docker Engine API client.
 *
 * All tests run WITHOUT Docker installed — http.request is fully mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import http from 'http';

import {
  MOCK_CONTAINERS,
  MOCK_IMAGES,
  MOCK_VERSION,
  MOCK_INFO,
  MOCK_DISK_USAGE,
  MOCK_PRUNE_CONTAINERS,
  MOCK_PRUNE_IMAGES,
} from '../../mocks/docker-responses';

// ── Mock http.request ─────────────────────────────────────────────────────

vi.mock('http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('http')>();
  return {
    ...actual,
    default: {
      ...actual,
      request: vi.fn(),
    },
    request: vi.fn(),
  };
});

const mockedRequest = http.request as unknown as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Create a mock http.IncomingMessage that emits data then ends.
 */
function createMockResponse(statusCode: number, body: string): EventEmitter & { statusCode: number } {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;

  // Schedule data + end events asynchronously
  process.nextTick(() => {
    if (body) {
      res.emit('data', Buffer.from(body));
    }
    res.emit('end');
  });

  return res;
}

/**
 * Create a mock http.ClientRequest (returned by http.request).
 */
function createMockClientRequest(): EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
  const req = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  req.write = vi.fn();
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

/**
 * Set up http.request mock to return a successful JSON response.
 */
function mockHttpSuccess(body: unknown, statusCode = 200): void {
  mockedRequest.mockImplementation((_opts: http.RequestOptions, callback: (res: unknown) => void) => {
    const res = createMockResponse(statusCode, JSON.stringify(body));
    callback(res);
    return createMockClientRequest();
  });
}

/**
 * Set up http.request mock to return a specific response per path.
 */
function mockHttpByPath(routes: Record<string, { status: number; body: unknown }>): void {
  mockedRequest.mockImplementation((opts: http.RequestOptions, callback: (res: unknown) => void) => {
    const path = opts.path ?? '';
    const route = routes[path];
    if (route) {
      const res = createMockResponse(route.status, JSON.stringify(route.body));
      callback(res);
    } else {
      const res = createMockResponse(404, JSON.stringify({ message: 'Not found' }));
      callback(res);
    }
    return createMockClientRequest();
  });
}

/**
 * Set up http.request mock to emit a connection error.
 */
function mockHttpError(errorMessage: string): void {
  mockedRequest.mockImplementation((_opts: http.RequestOptions, _callback: (res: unknown) => void) => {
    const req = createMockClientRequest();
    process.nextTick(() => {
      req.emit('error', new Error(errorMessage));
    });
    return req;
  });
}

/**
 * Set up http.request mock to simulate a timeout.
 */
function mockHttpTimeout(): void {
  mockedRequest.mockImplementation((_opts: http.RequestOptions, _callback: (res: unknown) => void) => {
    const req = createMockClientRequest();
    process.nextTick(() => {
      req.emit('timeout');
    });
    return req;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

// We need to import after mocking, and reset module between env changes
let dockerClient: typeof import('@/lib/docker/client');

const mockExistsSync = vi.fn().mockReturnValue(true);

async function loadClient(): Promise<typeof import('@/lib/docker/client')> {
  // Clear module cache to pick up new env vars
  vi.resetModules();
  // Re-mock http after module reset
  vi.doMock('http', async (importOriginal) => {
    const actual = await importOriginal<typeof import('http')>();
    return {
      ...actual,
      default: {
        ...actual,
        request: mockedRequest,
      },
      request: mockedRequest,
    };
  });
  // Mock fs so existsSync is controlled by tests
  vi.doMock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
      ...actual,
      default: {
        ...actual,
        existsSync: (...args: unknown[]) => mockExistsSync(...args),
      },
      existsSync: (...args: unknown[]) => mockExistsSync(...args),
    };
  });
  const mod = await import('@/lib/docker/client');
  mod.resetStateCache();
  return mod;
}

describe('Docker Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    // Clear env vars
    delete process.env.DOCKER_HOST;
    delete process.env.DOCKER_SOCKET;
  });

  afterEach(() => {
    delete process.env.DOCKER_HOST;
    delete process.env.DOCKER_SOCKET;
  });

  // ── DOCKER_HOST parsing ───────────────────────────────────────────────

  describe('parseDockerHost', () => {
    it('returns socket connection for unix:// scheme', async () => {
      process.env.DOCKER_HOST = 'unix:///custom/docker.sock';
      dockerClient = await loadClient();
      const conn = dockerClient.parseDockerHost();
      expect(conn).toEqual({ type: 'socket', socketPath: '/custom/docker.sock' });
    });

    it('returns TCP connection for tcp:// scheme', async () => {
      process.env.DOCKER_HOST = 'tcp://192.168.1.100:2375';
      dockerClient = await loadClient();
      const conn = dockerClient.parseDockerHost();
      expect(conn).toEqual({ type: 'tcp', hostname: '192.168.1.100', port: 2375 });
    });

    it('defaults TCP port to 2375 when not specified', async () => {
      process.env.DOCKER_HOST = 'tcp://myhost';
      dockerClient = await loadClient();
      const conn = dockerClient.parseDockerHost();
      expect(conn).toEqual({ type: 'tcp', hostname: 'myhost', port: 2375 });
    });

    it('returns null for unsupported schemes (ssh)', async () => {
      process.env.DOCKER_HOST = 'ssh://user@host';
      dockerClient = await loadClient();
      const conn = dockerClient.parseDockerHost();
      expect(conn).toBeNull();
    });

    it('uses legacy DOCKER_SOCKET env var', async () => {
      process.env.DOCKER_SOCKET = '/tmp/custom.sock';
      dockerClient = await loadClient();
      const conn = dockerClient.parseDockerHost();
      expect(conn).toEqual({ type: 'socket', socketPath: '/tmp/custom.sock' });
    });

    it('prefers DOCKER_HOST over DOCKER_SOCKET', async () => {
      process.env.DOCKER_HOST = 'tcp://remote:2375';
      process.env.DOCKER_SOCKET = '/tmp/custom.sock';
      dockerClient = await loadClient();
      const conn = dockerClient.parseDockerHost();
      expect(conn).toEqual({ type: 'tcp', hostname: 'remote', port: 2375 });
    });

    it('returns default socket when no env vars set', async () => {
      dockerClient = await loadClient();
      const conn = dockerClient.parseDockerHost();
      expect(conn).toEqual({ type: 'socket', socketPath: '/var/run/docker.sock' });
    });
  });

  // ── Docker state ──────────────────────────────────────────────────────

  describe('getDockerState', () => {
    it('returns "available" when Docker responds to /version', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_VERSION);

      const state = await dockerClient.getDockerState();
      expect(state).toBe('available');
    });

    it('returns "unreachable" when DOCKER_HOST is set but connection fails', async () => {
      process.env.DOCKER_HOST = 'tcp://badhost:2375';
      dockerClient = await loadClient();
      mockHttpError('ECONNREFUSED');

      const state = await dockerClient.getDockerState();
      expect(state).toBe('unreachable');
    });

    it('returns "not_configured" when no env vars set and default socket does not exist', async () => {
      // No DOCKER_HOST or DOCKER_SOCKET set, socket file doesn't exist
      mockExistsSync.mockReturnValue(false);
      dockerClient = await loadClient();

      const state = await dockerClient.getDockerState();
      expect(state).toBe('not_configured');
    });

    it('returns "not_configured" for unsupported DOCKER_HOST schemes', async () => {
      process.env.DOCKER_HOST = 'ssh://user@host';
      dockerClient = await loadClient();

      const state = await dockerClient.getDockerState();
      expect(state).toBe('not_configured');
    });

    it('caches state for 30 seconds', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_VERSION);

      const state1 = await dockerClient.getDockerState();
      expect(state1).toBe('available');

      // Now mock a failure — should still return cached value
      mockHttpError('ECONNREFUSED');
      const state2 = await dockerClient.getDockerState();
      expect(state2).toBe('available');

      // http.request should only have been called once (for the first check)
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });

    it('refreshes cache after TTL expires', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_VERSION);

      await dockerClient.getDockerState();

      // Manually reset cache to simulate TTL expiry
      dockerClient.resetStateCache();

      mockHttpError('ECONNREFUSED');
      const state = await dockerClient.getDockerState();
      expect(state).toBe('unreachable');
    });
  });

  // ── isDockerAvailable ─────────────────────────────────────────────────

  describe('isDockerAvailable', () => {
    it('returns true when Docker is available', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_VERSION);

      expect(await dockerClient.isDockerAvailable()).toBe(true);
    });

    it('returns false when Docker is not configured', async () => {
      process.env.DOCKER_HOST = 'ssh://unsupported';
      dockerClient = await loadClient();

      expect(await dockerClient.isDockerAvailable()).toBe(false);
    });
  });

  // ── listContainers ────────────────────────────────────────────────────

  describe('listContainers', () => {
    it('returns parsed container list', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_CONTAINERS);

      const containers = await dockerClient.listContainers();
      expect(containers).toHaveLength(3);
      expect(containers[0].Names).toEqual(['/nginx-proxy']);
      expect(containers[0].State).toBe('running');
      expect(containers[1].State).toBe('exited');
    });

    it('passes socketPath for unix connections', async () => {
      process.env.DOCKER_HOST = 'unix:///var/run/docker.sock';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_CONTAINERS);

      await dockerClient.listContainers();

      expect(mockedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          socketPath: '/var/run/docker.sock',
          path: '/containers/json?all=true',
          method: 'GET',
        }),
        expect.any(Function),
      );
    });

    it('passes hostname and port for TCP connections', async () => {
      process.env.DOCKER_HOST = 'tcp://192.168.1.50:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_CONTAINERS);

      await dockerClient.listContainers();

      expect(mockedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: '192.168.1.50',
          port: 2375,
          path: '/containers/json?all=true',
        }),
        expect.any(Function),
      );
    });
  });

  // ── containerAction ───────────────────────────────────────────────────

  describe('containerAction', () => {
    it('sends POST to /containers/{id}/{action}', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(undefined, 204);

      await dockerClient.containerAction('abc123', 'stop');

      expect(mockedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/containers/abc123/stop',
          method: 'POST',
        }),
        expect.any(Function),
      );
    });

    it('handles restart action', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(undefined, 204);

      await expect(dockerClient.containerAction('abc123', 'restart')).resolves.toBeUndefined();
    });
  });

  // ── listImages ────────────────────────────────────────────────────────

  describe('listImages', () => {
    it('returns parsed image list', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_IMAGES);

      const images = await dockerClient.listImages();
      expect(images).toHaveLength(3);
      expect(images[0].RepoTags).toEqual(['nginx:latest']);
      expect(images[0].Size).toBe(142_000_000);
    });
  });

  // ── getSystemInfo ─────────────────────────────────────────────────────

  describe('getSystemInfo', () => {
    it('combines /version and /info responses', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();

      mockHttpByPath({
        '/version': { status: 200, body: MOCK_VERSION },
        '/info': { status: 200, body: MOCK_INFO },
      });

      const info = await dockerClient.getSystemInfo();
      expect(info.ServerVersion).toBe('24.0.7');
      expect(info.Containers).toBe(3);
      expect(info.ContainersRunning).toBe(2);
      expect(info.ContainersStopped).toBe(1);
      expect(info.Images).toBe(3);
    });
  });

  // ── getDiskUsage ──────────────────────────────────────────────────────

  describe('getDiskUsage', () => {
    it('returns disk usage info', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_DISK_USAGE);

      const usage = await dockerClient.getDiskUsage();
      expect(usage.LayersSize).toBe(552_000_000);
    });
  });

  // ── Prune operations ──────────────────────────────────────────────────

  describe('pruneContainers', () => {
    it('returns prune result', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_PRUNE_CONTAINERS);

      const result = await dockerClient.pruneContainers();
      expect(result.ContainersDeleted).toEqual(['def456abc789']);
      expect(result.SpaceReclaimed).toBe(1024);
    });
  });

  describe('pruneImages', () => {
    it('returns prune result', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpSuccess(MOCK_PRUNE_IMAGES);

      const result = await dockerClient.pruneImages();
      expect(result.ImagesDeleted).toHaveLength(2);
      expect(result.SpaceReclaimed).toBe(50_000_000);
    });
  });

  // ── Timeout handling ──────────────────────────────────────────────────

  describe('timeout handling', () => {
    it('rejects with timeout error when request times out', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpTimeout();

      await expect(dockerClient.listContainers()).rejects.toThrow('timed out');
    });
  });

  // ── Connection error handling ─────────────────────────────────────────

  describe('error handling', () => {
    it('rejects with connection error on ECONNREFUSED', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();
      mockHttpError('connect ECONNREFUSED 127.0.0.1:2375');

      await expect(dockerClient.listContainers()).rejects.toThrow('Docker connection error');
    });

    it('rejects with descriptive error on non-2xx response', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();

      mockedRequest.mockImplementation((_opts: http.RequestOptions, callback: (res: unknown) => void) => {
        const res = createMockResponse(404, JSON.stringify({ message: 'no such container' }));
        callback(res);
        return createMockClientRequest();
      });

      await expect(dockerClient.containerAction('nonexistent', 'start')).rejects.toThrow('no such container');
    });

    it('throws "Docker is not configured" when connection is null', async () => {
      process.env.DOCKER_HOST = 'ssh://unsupported';
      dockerClient = await loadClient();

      await expect(dockerClient.listContainers()).rejects.toThrow('Docker is not configured');
    });
  });

  // ── getContainerLogs ──────────────────────────────────────────────────

  describe('getContainerLogs', () => {
    it('returns log text', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();

      // Docker log frames: 8-byte header + payload
      // stdout frame: type=1, size varies
      const logLine = 'Hello from container\n';
      const header = Buffer.alloc(8);
      header.writeUInt8(1, 0); // stdout
      header.writeUInt32BE(logLine.length, 4);
      const frame = Buffer.concat([header, Buffer.from(logLine)]);

      mockedRequest.mockImplementation((opts: http.RequestOptions, callback: (res: unknown) => void) => {
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = 200;
        process.nextTick(() => {
          res.emit('data', frame);
          res.emit('end');
        });
        callback(res);
        return createMockClientRequest();
      });

      const logs = await dockerClient.getContainerLogs('abc123', 50);
      expect(logs).toContain('Hello from container');
    });

    it('falls back to raw text for TTY mode containers', async () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      dockerClient = await loadClient();

      // TTY mode: raw text, no frame headers
      // We need to create a buffer that doesn't look like valid Docker frames
      const rawText = 'TTY mode log output';

      mockedRequest.mockImplementation((_opts: http.RequestOptions, callback: (res: unknown) => void) => {
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = 200;
        process.nextTick(() => {
          res.emit('data', Buffer.from(rawText));
          res.emit('end');
        });
        callback(res);
        return createMockClientRequest();
      });

      const logs = await dockerClient.getContainerLogs('abc123');
      expect(logs).toContain('TTY mode log output');
    });
  });

  // ── stripDockerLogHeaders ─────────────────────────────────────────────

  describe('stripDockerLogHeaders', () => {
    it('strips 8-byte frame headers from multiplexed log output', async () => {
      dockerClient = await loadClient();
      const line1 = 'line one\n';
      const line2 = 'line two\n';

      const header1 = Buffer.alloc(8);
      header1.writeUInt8(1, 0); // stdout
      header1.writeUInt32BE(line1.length, 4);

      const header2 = Buffer.alloc(8);
      header2.writeUInt8(2, 0); // stderr
      header2.writeUInt32BE(line2.length, 4);

      const buf = Buffer.concat([
        header1, Buffer.from(line1),
        header2, Buffer.from(line2),
      ]);

      const result = dockerClient.stripDockerLogHeaders(buf);
      expect(result).toBe('line one\nline two\n');
    });

    it('returns raw text when buffer has no valid frames', async () => {
      dockerClient = await loadClient();
      // A short buffer that can't contain a valid 8-byte header + meaningful payload
      const buf = Buffer.from('short');
      const result = dockerClient.stripDockerLogHeaders(buf);
      expect(result).toBe('short');
    });

    it('returns empty string for empty buffer', async () => {
      dockerClient = await loadClient();
      const result = dockerClient.stripDockerLogHeaders(Buffer.alloc(0));
      expect(result).toBe('');
    });
  });
});
