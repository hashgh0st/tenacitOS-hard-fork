/**
 * Safe Actions API
 * POST /api/actions  body: { actionId: string }
 *
 * SECURITY: Uses execFile (no shell expansion). Only predefined actions
 * from the registry are accepted. No user input in commands or args.
 */
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { getActionById } from '@/config/actions';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { hasPermission } from '@/lib/auth/roles';
import { logAudit } from '@/lib/auth/audit';
import { eventBus } from '@/lib/events/bus';

export interface ActionResult {
  actionId: string;
  status: 'success' | 'error' | 'streaming';
  output?: string;
  duration_ms?: number;
  timestamp: string;
  executionId?: string;
}

/**
 * Execute a non-streaming action synchronously using execFile.
 */
function executeAction(
  command: string,
  args: string[],
  timeout_ms: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { timeout: timeout_ms, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          // If the process was killed due to timeout, surface that clearly
          if (error.killed) {
            reject(new Error(`Action timed out after ${timeout_ms}ms (SIGKILL)`));
            return;
          }
          // Include stderr/stdout in error for context
          reject(
            new Error(
              error.message + (stderr ? `\n${stderr}` : '') + (stdout ? `\n${stdout}` : ''),
            ),
          );
          return;
        }
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );

    // Safety: ensure the process is killed on timeout even if execFile misses it
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeout_ms + 500);

    child.on('close', () => clearTimeout(timer));
  });
}

/**
 * Execute a streaming action in the background, emitting output to the event bus.
 */
function executeStreamingAction(
  executionId: string,
  command: string,
  args: string[],
  timeout_ms: number,
): void {
  const child = execFile(command, args, { timeout: timeout_ms, maxBuffer: 2 * 1024 * 1024 });

  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    eventBus.emit(`action:complete:${executionId}`, {
      status: 'error',
      output: `Action timed out after ${timeout_ms}ms (SIGKILL)`,
    });
  }, timeout_ms + 500);

  child.stdout?.on('data', (chunk: Buffer) => {
    eventBus.emit(`action:output:${executionId}`, chunk.toString());
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    eventBus.emit(`action:output:${executionId}`, chunk.toString());
  });

  child.on('close', (code) => {
    clearTimeout(timer);
    eventBus.emit(`action:complete:${executionId}`, {
      status: code === 0 ? 'success' : 'error',
      exitCode: code,
    });
  });

  child.on('error', (err) => {
    clearTimeout(timer);
    eventBus.emit(`action:complete:${executionId}`, {
      status: 'error',
      output: err.message,
    });
  });
}

async function handlePost(
  request: Request,
  _context: { params?: Record<string, string> },
  auth: AuthContext,
): Promise<Response> {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  let body: { actionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { actionId } = body;
  if (!actionId || typeof actionId !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid actionId' }, { status: 400 });
  }

  // Look up action in the registry — never accept arbitrary commands
  const action = getActionById(actionId);
  if (!action) {
    return NextResponse.json({ error: `Unknown action: ${actionId}` }, { status: 400 });
  }

  // Role enforcement
  if (!hasPermission(auth.role, action.role)) {
    logAudit({
      userId: auth.userId,
      username: auth.username,
      action: 'action.forbidden',
      target: actionId,
      details: { userRole: auth.role, requiredRole: action.role },
      severity: 'warning',
    });
    return NextResponse.json(
      { error: 'Forbidden', message: `Requires ${action.role} role or higher` },
      { status: 403 },
    );
  }

  // Log action execution
  logAudit({
    userId: auth.userId,
    username: auth.username,
    action: 'action.execute',
    target: actionId,
    details: { actionName: action.name, destructive: action.destructive },
    severity: action.destructive ? 'warning' : 'info',
  });

  // ── Streaming execution ─────────────────────────────────────────────────
  if (action.stream_output) {
    const executionId = randomUUID();

    executeStreamingAction(executionId, action.command, [...action.args], action.timeout_ms);

    const result: ActionResult = {
      actionId,
      status: 'streaming',
      executionId,
      timestamp,
    };
    return NextResponse.json(result);
  }

  // ── Synchronous execution ───────────────────────────────────────────────
  try {
    const { stdout, stderr } = await executeAction(
      action.command,
      [...action.args],
      action.timeout_ms,
    );
    const duration_ms = Date.now() - start;
    const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');

    logAudit({
      userId: auth.userId,
      username: auth.username,
      action: 'action.complete',
      target: actionId,
      details: { status: 'success', duration_ms },
      severity: 'info',
    });

    const result: ActionResult = {
      actionId,
      status: 'success',
      output,
      duration_ms,
      timestamp,
    };
    return NextResponse.json(result);
  } catch (err) {
    const duration_ms = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);

    logAudit({
      userId: auth.userId,
      username: auth.username,
      action: 'action.complete',
      target: actionId,
      details: { status: 'error', duration_ms, error: errMsg },
      severity: 'warning',
    });

    const result: ActionResult = {
      actionId,
      status: 'error',
      output: errMsg,
      duration_ms,
      timestamp,
    };
    return NextResponse.json(result);
  }
}

export const POST = withAuth(handlePost);
