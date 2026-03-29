/**
 * GET /api/auth/setup/check
 *
 * Returns whether the system needs initial setup (no users exist).
 * Public endpoint — no auth required.
 */
import { NextResponse } from 'next/server';
import { getDb, initAuthDb, needsSetup } from '@/lib/auth/db';

export async function GET() {
  const db = getDb();
  initAuthDb(db);

  return NextResponse.json({
    needsSetup: needsSetup(db),
  });
}
