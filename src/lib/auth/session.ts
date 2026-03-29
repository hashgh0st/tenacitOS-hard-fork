/**
 * Session token management
 *
 * Security requirements:
 * - Generate 32-byte random tokens with crypto.randomBytes
 * - Store only SHA-256 hash of token in database (never plaintext)
 * - Default TTL: 8 hours. Remember-me: 30 days
 */
import { randomBytes, createHash } from 'crypto';
import { getDb } from './db';
import type Database from 'better-sqlite3';

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionContext {
  userId: string;
  username: string;
  role: string;
}

/**
 * Hash a session token with SHA-256 for storage.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new session for a user.
 * Returns the plaintext token (to be sent to client) and expiry date.
 */
export function createSession(
  userId: string,
  ip: string,
  userAgent: string,
  rememberMe?: boolean,
  db?: Database.Database,
): { token: string; expiresAt: Date } {
  const d = db ?? getDb();
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const ttl = rememberMe ? REMEMBER_ME_TTL_MS : DEFAULT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);

  d.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, is_remember_me)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    tokenHash,
    ip,
    userAgent,
    expiresAt.toISOString(),
    rememberMe ? 1 : 0,
  );

  return { token, expiresAt };
}

/**
 * Validate a session token. Returns user context if valid and not expired, null otherwise.
 */
export function validateSession(
  token: string,
  db?: Database.Database,
): SessionContext | null {
  const d = db ?? getDb();
  const tokenHash = hashToken(token);

  const row = d.prepare(`
    SELECT s.user_id, u.username, u.role
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ?
      AND s.expires_at > datetime('now')
      AND u.is_active = 1
  `).get(tokenHash) as { user_id: string; username: string; role: string } | undefined;

  if (!row) return null;

  return {
    userId: row.user_id,
    username: row.username,
    role: row.role,
  };
}

/**
 * Delete a specific session by its plaintext token.
 */
export function deleteSession(token: string, db?: Database.Database): void {
  const d = db ?? getDb();
  const tokenHash = hashToken(token);
  d.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

/**
 * Delete all sessions for a given user.
 */
export function deleteUserSessions(userId: string, db?: Database.Database): void {
  const d = db ?? getDb();
  d.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/**
 * Remove expired sessions. Returns the number of rows deleted.
 */
export function cleanExpiredSessions(db?: Database.Database): number {
  const d = db ?? getDb();
  const result = d.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  return result.changes;
}
