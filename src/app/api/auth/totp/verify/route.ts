/**
 * POST /api/auth/totp/verify
 *
 * Two use cases:
 *
 * 1. Login flow: { token, code }
 *    Verify TOTP code during login. The `token` is the temporary token
 *    returned by /api/auth/login when TOTP is required.
 *    Creates a full session if the code is valid.
 *
 * 2. Setup flow: { code } (with valid auth session)
 *    Verify TOTP code during initial setup. Stores the encrypted secret
 *    and enables the TOTP flag on the user.
 *    Requires the user to have previously called /api/auth/totp/setup.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb, initAuthDb } from '@/lib/auth/db';
import { createSession, validateSession } from '@/lib/auth/session';
import { verifyTOTP, encryptTOTPSecret, decryptTOTPSecret } from '@/lib/auth/totp';
import { logAudit } from '@/lib/auth/audit';
import { consumePendingTOTP, hashTOTPToken } from '@/app/api/auth/login/route';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get('tenacitos_session')?.value || null;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  let body: { token?: string; code?: string; secret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { token, code, secret } = body;

  if (!code || typeof code !== 'string') {
    return NextResponse.json(
      { success: false, error: 'TOTP code is required' },
      { status: 400 },
    );
  }

  // Validate code format (6 digits)
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { success: false, error: 'TOTP code must be 6 digits' },
      { status: 400 },
    );
  }

  const db = getDb();
  initAuthDb(db);

  // --- LOGIN FLOW: token is present ---
  if (token) {
    const tokenHash = hashTOTPToken(token);
    const pending = consumePendingTOTP(tokenHash);

    if (!pending) {
      logAudit({
        username: 'anonymous',
        action: 'totp.verify_failed',
        details: { reason: 'invalid_or_expired_token', flow: 'login' },
        ipAddress: ip,
        severity: 'warning',
      });

      return NextResponse.json(
        { success: false, error: 'Invalid or expired TOTP session' },
        { status: 401 },
      );
    }

    // Look up the user's TOTP secret from the database
    const user = db
      .prepare('SELECT totp_secret FROM users WHERE id = ? AND is_active = 1')
      .get(pending.userId) as { totp_secret: string | null } | undefined;

    if (!user || !user.totp_secret) {
      return NextResponse.json(
        { success: false, error: 'TOTP not configured for this user' },
        { status: 400 },
      );
    }

    // Decrypt the stored secret and verify the code
    const decryptedSecret = decryptTOTPSecret(user.totp_secret);
    if (!verifyTOTP(decryptedSecret, code)) {
      logAudit({
        userId: pending.userId,
        username: pending.username,
        action: 'totp.verify_failed',
        details: { reason: 'invalid_code', flow: 'login' },
        ipAddress: ip,
        severity: 'warning',
      });

      return NextResponse.json(
        { success: false, error: 'Invalid TOTP code' },
        { status: 401 },
      );
    }

    // Code is valid — create full session
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const session = createSession(pending.userId, ip, userAgent);

    // Update last_login
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(pending.userId);

    logAudit({
      userId: pending.userId,
      username: pending.username,
      action: 'login.success',
      details: { method: 'totp' },
      ipAddress: ip,
    });

    const response = NextResponse.json({
      success: true,
      user: { username: pending.username, role: pending.role },
    });

    response.cookies.set('tenacitos_session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60, // 8 hours (default, no remember-me for TOTP login)
      path: '/',
    });

    return response;
  }

  // --- SETUP FLOW: no token, must be authenticated ---
  const sessionToken = getSessionToken(request);
  if (!sessionToken) {
    return NextResponse.json(
      { success: false, error: 'Authentication required for TOTP setup' },
      { status: 401 },
    );
  }

  const sessionCtx = validateSession(sessionToken);
  if (!sessionCtx) {
    return NextResponse.json(
      { success: false, error: 'Invalid or expired session' },
      { status: 401 },
    );
  }

  // For setup flow, the client must provide the secret that was generated
  // by /api/auth/totp/setup (shown to the user for manual entry).
  if (!secret || typeof secret !== 'string') {
    return NextResponse.json(
      { success: false, error: 'TOTP secret is required for setup verification' },
      { status: 400 },
    );
  }

  // Verify the code against the provided secret
  if (!verifyTOTP(secret, code)) {
    logAudit({
      userId: sessionCtx.userId,
      username: sessionCtx.username,
      action: 'totp.setup_verify_failed',
      details: { reason: 'invalid_code' },
      ipAddress: ip,
      severity: 'warning',
    });

    return NextResponse.json(
      { success: false, error: 'Invalid TOTP code — please try again' },
      { status: 400 },
    );
  }

  // Code is valid — encrypt and store the secret, enable TOTP
  const encryptedSecret = encryptTOTPSecret(secret);

  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1, updated_at = datetime(\'now\') WHERE id = ?').run(
    encryptedSecret,
    sessionCtx.userId,
  );

  logAudit({
    userId: sessionCtx.userId,
    username: sessionCtx.username,
    action: 'totp.enabled',
    ipAddress: ip,
  });

  return NextResponse.json({
    success: true,
    message: 'TOTP has been enabled for your account',
  });
}
