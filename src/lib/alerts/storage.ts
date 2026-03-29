/**
 * Alert storage: Rules (JSON file) + History (SQLite).
 *
 * Rules are persisted to `data/alert-rules.json`.
 * History is stored in `data/alerts.db` with WAL mode.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { AlertRule, AlertHistoryEntry } from './types';

// ── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const RULES_PATH = path.join(DATA_DIR, 'alert-rules.json');
const EXAMPLE_PATH = path.join(DATA_DIR, 'alert-rules.example.json');
const DB_PATH = path.join(DATA_DIR, 'alerts.db');

// ── Rules (JSON) ─────────────────────────────────────────────────────────────

export function loadRules(): AlertRule[] {
  try {
    if (fs.existsSync(RULES_PATH)) {
      const raw = fs.readFileSync(RULES_PATH, 'utf-8');
      return JSON.parse(raw) as AlertRule[];
    }
    if (fs.existsSync(EXAMPLE_PATH)) {
      const raw = fs.readFileSync(EXAMPLE_PATH, 'utf-8');
      return JSON.parse(raw) as AlertRule[];
    }
    return [];
  } catch {
    return [];
  }
}

export function saveRules(rules: AlertRule[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2), 'utf-8');
}

export function getRuleById(id: string): AlertRule | undefined {
  const rules = loadRules();
  return rules.find((r) => r.id === id);
}

export function addRule(rule: AlertRule): void {
  const rules = loadRules();
  rules.push(rule);
  saveRules(rules);
}

export function updateRule(id: string, updates: Partial<AlertRule>): AlertRule | null {
  const rules = loadRules();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  rules[idx] = { ...rules[idx], ...updates, id }; // prevent id overwrite
  saveRules(rules);
  return rules[idx];
}

export function deleteRule(id: string): boolean {
  const rules = loadRules();
  const filtered = rules.filter((r) => r.id !== id);
  if (filtered.length === rules.length) return false;
  saveRules(filtered);
  return true;
}

// ── History (SQLite) ─────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS alert_history (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT NOT NULL,
    metric_value REAL NOT NULL,
    threshold_value REAL NOT NULL,
    fired_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON alert_history(rule_id);
  CREATE INDEX IF NOT EXISTS idx_alert_history_fired ON alert_history(fired_at);
  CREATE INDEX IF NOT EXISTS idx_alert_history_severity ON alert_history(severity);
`;

const MAX_HISTORY = 10_000;

let _db: Database.Database | null = null;

/**
 * Returns singleton better-sqlite3 instance for alerts.db.
 * Accepts an optional injected database for testing with :memory:.
 */
export function getAlertDb(injectedDb?: Database.Database): Database.Database {
  if (injectedDb) return injectedDb;
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');

  return _db;
}

export function initAlertDb(db?: Database.Database): void {
  const d = db ?? getAlertDb();
  d.exec(SCHEMA_SQL);
}

export function recordAlert(entry: AlertHistoryEntry, db?: Database.Database): void {
  const d = db ?? getAlertDb();
  d.prepare(`
    INSERT INTO alert_history (id, rule_id, rule_name, severity, message, metric_value, threshold_value, fired_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.ruleId,
    entry.ruleName,
    entry.severity,
    entry.message,
    entry.metricValue,
    entry.thresholdValue,
    entry.firedAt,
    entry.resolvedAt,
  );
}

export function resolveAlert(ruleId: string, db?: Database.Database): void {
  const d = db ?? getAlertDb();
  d.prepare(`
    UPDATE alert_history
    SET resolved_at = datetime('now')
    WHERE rule_id = ? AND resolved_at IS NULL
    ORDER BY fired_at DESC
    LIMIT 1
  `).run(ruleId);
}

export interface HistoryQueryOpts {
  ruleId?: string;
  severity?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function getAlertHistory(
  opts: HistoryQueryOpts,
  db?: Database.Database,
): { entries: AlertHistoryEntry[]; total: number } {
  const d = db ?? getAlertDb();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.ruleId) {
    conditions.push('rule_id = ?');
    params.push(opts.ruleId);
  }
  if (opts.severity) {
    conditions.push('severity = ?');
    params.push(opts.severity);
  }
  if (opts.from) {
    conditions.push('fired_at >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    conditions.push('fired_at <= ?');
    params.push(opts.to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const countRow = d.prepare(`SELECT COUNT(*) as total FROM alert_history ${where}`).get(...params) as { total: number };

  const rows = d.prepare(
    `SELECT * FROM alert_history ${where} ORDER BY fired_at DESC LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as Array<{
    id: string;
    rule_id: string;
    rule_name: string;
    severity: string;
    message: string;
    metric_value: number;
    threshold_value: number;
    fired_at: string;
    resolved_at: string | null;
  }>;

  return {
    entries: rows.map((r) => ({
      id: r.id,
      ruleId: r.rule_id,
      ruleName: r.rule_name,
      severity: r.severity as AlertHistoryEntry['severity'],
      message: r.message,
      metricValue: r.metric_value,
      thresholdValue: r.threshold_value,
      firedAt: r.fired_at,
      resolvedAt: r.resolved_at,
    })),
    total: countRow.total,
  };
}

export function getActiveAlerts(db?: Database.Database): AlertHistoryEntry[] {
  const d = db ?? getAlertDb();

  const rows = d.prepare(
    'SELECT * FROM alert_history WHERE resolved_at IS NULL ORDER BY fired_at DESC',
  ).all() as Array<{
    id: string;
    rule_id: string;
    rule_name: string;
    severity: string;
    message: string;
    metric_value: number;
    threshold_value: number;
    fired_at: string;
    resolved_at: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    ruleId: r.rule_id,
    ruleName: r.rule_name,
    severity: r.severity as AlertHistoryEntry['severity'],
    message: r.message,
    metricValue: r.metric_value,
    thresholdValue: r.threshold_value,
    firedAt: r.fired_at,
    resolvedAt: r.resolved_at,
  }));
}

export function pruneHistory(db?: Database.Database): number {
  const d = db ?? getAlertDb();

  const countRow = d.prepare('SELECT COUNT(*) as total FROM alert_history').get() as { total: number };
  if (countRow.total <= MAX_HISTORY) return 0;

  const excess = countRow.total - MAX_HISTORY;

  const result = d.prepare(`
    DELETE FROM alert_history
    WHERE id IN (
      SELECT id FROM alert_history ORDER BY fired_at ASC LIMIT ?
    )
  `).run(excess);

  return result.changes;
}

/**
 * Reset the singleton for testing purposes.
 */
export function _resetAlertDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
