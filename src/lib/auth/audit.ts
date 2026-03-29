/**
 * Audit logger
 *
 * Writes security-relevant events to the audit_log table in auth.db.
 * Supports configurable retention via AUDIT_RETENTION_DAYS env var.
 */
import { getDb } from './db';
import type Database from 'better-sqlite3';

const DEFAULT_RETENTION_DAYS = 90;

export interface AuditParams {
  userId?: string;
  username: string;
  action: string;
  target?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  severity?: 'info' | 'warning' | 'critical';
}

/**
 * Log an audit event to the audit_log table.
 */
export function logAudit(params: AuditParams, db?: Database.Database): void {
  const d = db ?? getDb();

  d.prepare(`
    INSERT INTO audit_log (user_id, username, action, target, details, ip_address, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.userId ?? null,
    params.username,
    params.action,
    params.target ?? null,
    params.details ? JSON.stringify(params.details) : null,
    params.ipAddress ?? null,
    params.severity ?? 'info',
  );
}

/**
 * Delete audit entries older than the configured retention period.
 * Returns the number of rows deleted.
 */
export function cleanOldAuditEntries(db?: Database.Database): number {
  const d = db ?? getDb();
  const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS ?? '', 10) || DEFAULT_RETENTION_DAYS;

  const result = d.prepare(`
    DELETE FROM audit_log
    WHERE timestamp < datetime('now', ?)
  `).run(`-${retentionDays} days`);

  return result.changes;
}
