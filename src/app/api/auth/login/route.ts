/**
 * POST /api/auth/login
 *
 * Authenticate with username + password.
 * If TOTP is enabled, returns { requiresTOTP: true, sessionToken: temporaryToken }.
 * Otherwise, creates a full session and sets the httpOnly cookie.
 *
 * Rate limited: 5 attempts per 15 minutes per IP.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb, initAuthDb } from '@/lib/auth/db';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { logAudit } from '@/lib/auth/audit';
import { SlidingWindowLimiter } from '@/lib/rate-limiter';
import { randomBytes, createHash } from 'crypto';

// --- Rate limiter: 5 attempts per 15 min, 15-min lockout after limit ---
const LOCKOUT_MS = 15 * 60 * 1000;

const loginLimiter = new SlidingWindowLimiter({
  maxActions: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: LOCKOUT_MS,
});

// Temporary TOTP tokens: maps SHA-256(token) -> { userId, username, role, expiresAt }
// These are short-lived (5 min) and used only during the TOTP verification step.
interface PendingTOTP {
  userId: string;
  username: string;
  role: string;
  expiresAt: number;
}

const pendingTOTPSessions = new Map<string, PendingTOTP>();

// Exported for use by the TOTP verify route
export function consumePendingTOTP(tokenHash: string): PendingTOTP | null {
  const pending = pendingTOTPSessions.get(tokenHash);
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    pendingTOTPSessions.delete(tokenHash);
    return null;
  }
  pendingTOTPSessions.delete(tokenHash);
  return pending;
}

export function hashTOTPToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limit check
  const { allowed, retryAfterMs } = loginLimiter.check(ip);
  if (!allowed) {
    const retryAfterSec = Math.ceil((retryAfterMs ?? LOCKOUT_MS) / 1000);
    return NextResponse.json(
      { success: false, error: 'Too many failed attempts. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSec) },
      },
    );
  }

  let body: { username?: string; password?: string; rememberMe?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { username, password, rememberMe } = body;

  if (!username || !password) {
    return NextResponse.json(
      { success: false, error: 'Username and password are required' },
      { status: 400 },
    );
  }

  // Ensure DB is initialized
  const db = getDb();
  initAuthDb(db);

  // Look up user
  const user = db
    .prepare(
      'SELECT id, username, password_hash, role, totp_enabled, totp_secret, is_active FROM users WHERE username = ?',
    )
    .get(username) as
    | {
        id: string;
        username: string;
        password_hash: string;
        role: string;
        totp_enabled: number;
        totp_secret: string | null;
        is_active: number;
      }
    | undefined;

  if (!user || !user.is_active) {
    loginLimiter.record(ip);
    logAudit({
      username: username,
      action: 'login.failed',
      details: { reason: 'invalid_credentials' },
      ipAddress: ip,
      severity: 'warning',
    });

    return NextResponse.json(
      { success: false, error: 'Invalid username or password' },
      { status: 401 },
    );
  }

  // Verify password
  const validPassword = await verifyPassword(user.password_hash, password);
  if (!validPassword) {
    loginLimiter.record(ip);
    logAudit({
      userId: user.id,
      username: user.username,
      action: 'login.failed',
      details: { reason: 'invalid_password' },
      ipAddress: ip,
      severity: 'warning',
    });

    return NextResponse.json(
      { success: false, error: 'Invalid username or password' },
      { status: 401 },
    );
  }

  // If TOTP is enabled, return a temporary token for the TOTP verification step
  if (user.totp_enabled && user.totp_secret) {
    const tempToken = randomBytes(32).toString('hex');
    const tempTokenHash = hashTOTPToken(tempToken);

    pendingTOTPSessions.set(tempTokenHash, {
      userId: user.id,
      username: user.username,
      role: user.role,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    logAudit({
      userId: user.id,
      username: user.username,
      action: 'login.totp_required',
      ipAddress: ip,
    });

    loginLimiter.reset(ip);
    return NextResponse.json({
      success: true,
      requiresTOTP: true,
      sessionToken: tempToken,
    });
  }

  // No TOTP — create full session
  loginLimiter.reset(ip);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const session = createSession(user.id, ip, userAgent, rememberMe);

  // Update last_login
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  logAudit({
    userId: user.id,
    username: user.username,
    action: 'login.success',
    ipAddress: ip,
  });

  const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
  const response = NextResponse.json({
    success: true,
    user: { username: user.username, role: user.role },
  });

  response.cookies.set('tenacitos_session', session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });

  return response;
}
