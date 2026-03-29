/**
 * Tests for the safe action execution system.
 *
 * Validates:
 * - Action lookup by ID (valid ID returns action, invalid returns undefined)
 * - Role enforcement (viewer can't run operator actions)
 * - Command uses execFile not exec
 * - Timeout kills process
 * - Unknown action ID rejected
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { existsSync } from 'fs';
import path from 'path';
import { initAuthDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { getActionById, ACTIONS } from '@/config/actions';

// ── Mock the database ──────────────────────────────────────────────────────

let testDb: Database.Database;

vi.mock('@/lib/auth/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/db')>('@/lib/auth/db');
  return {
    ...actual,
    getDb: () => testDb,
  };
});

// ── Mock child_process to verify execFile is used ──────────────────────────

const mockExecFile = vi.fn();

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

// ── Mock event bus ─────────────────────────────────────────────────────────

vi.mock('@/lib/events/bus', () => ({
  eventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Action Registry', () => {
  it('returns an action for a valid ID', () => {
    const action = getActionById('system-info');
    expect(action).toBeDefined();
    expect(action!.id).toBe('system-info');
    expect(action!.command).toBe('uname');
    expect(action!.args).toEqual(['-a']);
  });

  it('returns undefined for an invalid ID', () => {
    const action = getActionById('nonexistent-action');
    expect(action).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    const action = getActionById('');
    expect(action).toBeUndefined();
  });

  it('has unique IDs for all actions', () => {
    const ids = ACTIONS.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all actions have valid categories', () => {
    const validCategories = ['gateway', 'data', 'system', 'maintenance'];
    for (const action of ACTIONS) {
      expect(validCategories).toContain(action.category);
    }
  });

  it('all actions have valid roles', () => {
    const validRoles = ['viewer', 'operator'];
    for (const action of ACTIONS) {
      expect(validRoles).toContain(action.role);
    }
  });

  it('all actions have positive timeouts', () => {
    for (const action of ACTIONS) {
      expect(action.timeout_ms).toBeGreaterThan(0);
    }
  });

  it('all destructive actions require operator role', () => {
    for (const action of ACTIONS) {
      if (action.destructive) {
        expect(action.role).toBe('operator');
      }
    }
  });

  it('all script-backed actions reference files that exist', () => {
    for (const action of ACTIONS) {
      if (action.command === 'npx' && action.args[0] === 'tsx' && action.args[1]) {
        expect(
          existsSync(path.join(process.cwd(), action.args[1])),
          `${action.id} points to missing script ${action.args[1]}`,
        ).toBe(true);
      }
    }
  });
});

describe('Actions API Route', () => {
  const TEST_OPERATOR_ID = 'user-operator-001';
  const TEST_VIEWER_ID = 'user-viewer-001';
  const TEST_IP = '10.0.0.1';
  const TEST_UA = 'TestAgent/1.0';

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initAuthDb(testDb);

    // Create test users
    testDb
      .prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES (?, 'operator_user', 'hash', 'operator')",
      )
      .run(TEST_OPERATOR_ID);

    testDb
      .prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES (?, 'viewer_user', 'hash', 'viewer')",
      )
      .run(TEST_VIEWER_ID);

    // Reset mocks
    mockExecFile.mockReset();
  });

  afterEach(() => {
    testDb.close();
  });

  function makeRequest(
    sessionToken: string,
    body: Record<string, unknown>,
  ): NextRequest {
    return new NextRequest('http://localhost/api/actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `tenacitos_session=${sessionToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  it('rejects unknown action IDs with 400', async () => {
    const { token } = createSession(TEST_OPERATOR_ID, TEST_IP, TEST_UA, false, testDb);

    // Import the route handler fresh to use mocked dependencies
    const { POST } = await import('@/app/api/actions/route');
    const response = await POST(
      makeRequest(token, { actionId: 'totally-invalid' }),
      { params: {} },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Unknown action');
  });

  it('rejects requests with missing actionId', async () => {
    const { token } = createSession(TEST_OPERATOR_ID, TEST_IP, TEST_UA, false, testDb);

    const { POST } = await import('@/app/api/actions/route');
    const response = await POST(makeRequest(token, {}), { params: {} });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Missing');
  });

  it('enforces role: viewer cannot run operator actions', async () => {
    const { token } = createSession(TEST_VIEWER_ID, TEST_IP, TEST_UA, false, testDb);

    const { POST } = await import('@/app/api/actions/route');
    const response = await POST(
      makeRequest(token, { actionId: 'gateway-restart' }),
      { params: {} },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Forbidden');
  });

  it('allows viewer to run viewer-level actions', async () => {
    const { token } = createSession(TEST_VIEWER_ID, TEST_IP, TEST_UA, false, testDb);

    // Set up execFile mock to simulate successful execution
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const child = {
          on: vi.fn((_event: string, handler: () => void) => {
            // Simulate immediate close
            if (_event === 'close') setTimeout(handler, 0);
          }),
          kill: vi.fn(),
          stdout: null,
          stderr: null,
        };
        // Call the callback asynchronously
        setTimeout(() => callback(null, 'Linux test 5.15.0', ''), 0);
        return child;
      },
    );

    const { POST } = await import('@/app/api/actions/route');
    const response = await POST(
      makeRequest(token, { actionId: 'system-info' }),
      { params: {} },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.actionId).toBe('system-info');
    expect(body.status).toBe('success');
  });

  it('uses execFile, not exec', async () => {
    const { token } = createSession(TEST_OPERATOR_ID, TEST_IP, TEST_UA, false, testDb);

    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const child = {
          on: vi.fn((_event: string, handler: () => void) => {
            if (_event === 'close') setTimeout(handler, 0);
          }),
          kill: vi.fn(),
          stdout: null,
          stderr: null,
        };
        setTimeout(() => callback(null, 'test output', ''), 0);
        return child;
      },
    );

    const { POST } = await import('@/app/api/actions/route');
    await POST(makeRequest(token, { actionId: 'system-info' }), { params: {} });

    // Verify execFile was called with the correct command and args
    expect(mockExecFile).toHaveBeenCalled();
    const [cmd, args] = mockExecFile.mock.calls[0];
    expect(cmd).toBe('uname');
    expect(args).toEqual(['-a']);
  });

  it('handles timeout by returning error', async () => {
    const { token } = createSession(TEST_OPERATOR_ID, TEST_IP, TEST_UA, false, testDb);

    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        callback: (err: Error & { killed?: boolean } | null, stdout: string, stderr: string) => void,
      ) => {
        const child = {
          on: vi.fn((_event: string, handler: () => void) => {
            if (_event === 'close') setTimeout(handler, 0);
          }),
          kill: vi.fn(),
          stdout: null,
          stderr: null,
        };
        // Simulate a timeout error (killed = true)
        const err = new Error('Process timed out') as Error & { killed: boolean };
        err.killed = true;
        setTimeout(() => callback(err, '', ''), 0);
        return child;
      },
    );

    const { POST } = await import('@/app/api/actions/route');
    const response = await POST(
      makeRequest(token, { actionId: 'system-info' }),
      { params: {} },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.output).toContain('timed out');
  });

  it('returns streaming response for streaming actions', async () => {
    const { token } = createSession(TEST_OPERATOR_ID, TEST_IP, TEST_UA, false, testDb);

    // For streaming actions, execFile is called without callback (returns ChildProcess)
    mockExecFile.mockImplementation(() => {
      return {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
    });

    const { POST } = await import('@/app/api/actions/route');
    const response = await POST(
      makeRequest(token, { actionId: 'gateway-restart' }),
      { params: {} },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('streaming');
    expect(body.executionId).toBeDefined();
    expect(typeof body.executionId).toBe('string');
  });

  it('supports promise-based params on the action stream route', async () => {
    const { token } = createSession(TEST_OPERATOR_ID, TEST_IP, TEST_UA, false, testDb);
    const { GET } = await import('@/app/api/actions/[executionId]/stream/route');

    const response = await GET(
      new NextRequest('http://localhost/api/actions/exec-123/stream', {
        headers: {
          cookie: `tenacitos_session=${token}`,
        },
      }),
      { params: Promise.resolve({ executionId: 'exec-123' }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    expect(decoder.decode(value)).toContain('"executionId":"exec-123"');
    await reader.cancel();
  });

  it('returns 401 when no session is present', async () => {
    const request = new NextRequest('http://localhost/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId: 'system-info' }),
    });

    const { POST } = await import('@/app/api/actions/route');
    const response = await POST(request, { params: {} });

    expect(response.status).toBe(401);
  });
});

describe('Security: No shell injection possible', () => {
  it('action commands are static strings, not user input', () => {
    for (const action of ACTIONS) {
      // Command should be a simple binary name — no spaces, no semicolons, no pipes
      expect(action.command).not.toContain(';');
      expect(action.command).not.toContain('|');
      expect(action.command).not.toContain('&&');
      expect(action.command).not.toContain('`');
      expect(action.command).not.toContain('$(');
    }
  });

  it('action args contain no shell metacharacters', () => {
    for (const action of ACTIONS) {
      for (const arg of action.args) {
        expect(arg).not.toContain(';');
        expect(arg).not.toContain('|');
        expect(arg).not.toContain('&&');
        expect(arg).not.toContain('`');
        expect(arg).not.toContain('$(');
      }
    }
  });

  it('route source uses execFile, not exec', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const routeSource = readFileSync(
      resolve(__dirname, '../../../src/app/api/actions/route.ts'),
      'utf-8',
    );

    // Must import execFile
    expect(routeSource).toContain("execFile");

    // Must NOT import exec (but execFile contains 'exec', so check the import line)
    const importLines = routeSource
      .split('\n')
      .filter((l) => l.includes("from 'child_process'"));
    for (const line of importLines) {
      // Should have execFile but not bare exec
      expect(line).toContain('execFile');
      // Ensure no standalone 'exec' import (not part of execFile)
      const imports = line.match(/\{([^}]+)\}/)?.[1] || '';
      const importedNames = imports.split(',').map((s) => s.trim());
      for (const name of importedNames) {
        expect(name).not.toBe('exec');
      }
    }
  });
});
