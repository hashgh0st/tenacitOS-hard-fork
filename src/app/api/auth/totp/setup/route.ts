/**
 * POST /api/auth/totp/setup
 *
 * Generate a TOTP secret + QR code for the authenticated user.
 * Returns { secret, qrDataUrl } — the secret is shown once for manual entry.
 * Does NOT enable TOTP yet — that happens when the user verifies a code.
 *
 * Requires authentication.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { generateTOTPSecret } from '@/lib/auth/totp';
import { logAudit } from '@/lib/auth/audit';

export const POST = withAuth(async (request, _context, auth) => {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const { secret, qrDataUrl } = generateTOTPSecret(auth.username);
  const qr = await qrDataUrl;

  logAudit({
    userId: auth.userId,
    username: auth.username,
    action: 'totp.setup_initiated',
    ipAddress: ip,
  });

  return NextResponse.json({
    success: true,
    secret,
    qrDataUrl: qr,
  });
});
