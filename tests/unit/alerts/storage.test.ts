/**
 * Tests for src/lib/alerts/storage.ts
 * Rule CRUD (mocked fs) + History (in-memory SQLite)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { AlertHistoryEntry, AlertRule } from '@/lib/alerts/types';

// ── Mock fs at top level ─────────────────────────────────────────────────────

const mockExistsSync = vi.fn().mockReturnValue(false);
const mockReadFileSync = vi.fn().mockReturnValue('[]');
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  },
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

import {
  loadRules,
  saveRules,
  getRuleById,
  addRule,
  updateRule,
  deleteRule,
  initAlertDb,
  recordAlert,
  resolveAlert,
  getAlertHistory,
  getActiveAlerts,
  pruneHistory,
} from '@/lib/alerts/storage';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<AlertHistoryEntry> = {}): AlertHistoryEntry {
  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ruleId: 'cpu-high',
    ruleName: 'CPU high',
    severity: 'warning',
    message: 'CPU is at 95%',
    metricValue: 95,
    thresholdValue: 90,
    firedAt: new Date().toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}

const sampleRules: AlertRule[] = [
  {
    id: 'cpu-high',
    name: 'CPU high',
    condition: { metric: 'system.cpu', operator: 'gt', value: 90 },
    sustained_checks: 3,
    cooldown_minutes: 15,
    channels: ['in_app'],
    severity: 'warning',
    enabled: true,
  },
];

// ── Rule loading (mocked fs) ─────────────────────────────────────────────────

describe('Rule loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads rules from alert-rules.json when it exists', () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('alert-rules.json') && !p.includes('example'),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleRules));

    const rules = loadRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('cpu-high');
  });

  it('falls back to example file when alert-rules.json missing', () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('example'));
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleRules));

    const rules = loadRules();
    expect(rules).toHaveLength(1);
  });

  it('returns empty array when no files exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadRules()).toEqual([]);
  });

  it('returns empty array on parse error', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('invalid json{{{');
    expect(loadRules()).toEqual([]);
  });

  it('saveRules writes JSON to file', () => {
    mockExistsSync.mockReturnValue(true);
    saveRules(sampleRules);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('alert-rules.json'),
      expect.stringContaining('"cpu-high"'),
      'utf-8',
    );
  });

  it('getRuleById finds the rule', () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('alert-rules.json') && !p.includes('example'),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleRules));

    expect(getRuleById('cpu-high')).toBeDefined();
    expect(getRuleById('nonexistent')).toBeUndefined();
  });

  it('addRule appends and saves', () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('alert-rules.json') && !p.includes('example'),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleRules));

    const newRule = { ...sampleRules[0], id: 'ram-high', name: 'RAM high' };
    addRule(newRule);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].id).toBe('ram-high');
  });

  it('updateRule modifies and saves', () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('alert-rules.json') && !p.includes('example'),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleRules));

    const result = updateRule('cpu-high', { name: 'CPU very high' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('CPU very high');
    expect(result!.id).toBe('cpu-high');
  });

  it('updateRule returns null for missing rule', () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('alert-rules.json') && !p.includes('example'),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleRules));

    expect(updateRule('nonexistent', { name: 'nope' })).toBeNull();
  });

  it('deleteRule removes and saves', () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('alert-rules.json') && !p.includes('example'),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleRules));

    expect(deleteRule('cpu-high')).toBe(true);
    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(JSON.parse(written)).toHaveLength(0);
  });

  it('deleteRule returns false for missing rule', () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('alert-rules.json') && !p.includes('example'),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleRules));

    expect(deleteRule('nonexistent')).toBe(false);
  });
});

// ── History (SQLite) ─────────────────────────────────────────────────────────

describe('Alert History (SQLite)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initAlertDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates alert_history table with correct schema', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alert_history'")
      .all() as { name: string }[];
    expect(tables).toHaveLength(1);
  });

  it('creates required indexes', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_alert_%'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_alert_history_rule');
    expect(names).toContain('idx_alert_history_fired');
    expect(names).toContain('idx_alert_history_severity');
  });

  it('recordAlert inserts a history entry', () => {
    const entry = makeEntry({ id: 'test-1' });
    recordAlert(entry, db);

    const row = db.prepare('SELECT * FROM alert_history WHERE id = ?').get('test-1') as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.rule_id).toBe('cpu-high');
    expect(row.severity).toBe('warning');
    expect(row.resolved_at).toBeNull();
  });

  it('enforces severity CHECK constraint', () => {
    expect(() =>
      db.prepare(`
        INSERT INTO alert_history (id, rule_id, rule_name, severity, message, metric_value, threshold_value, fired_at)
        VALUES ('bad', 'r1', 'test', 'unknown_severity', 'msg', 1, 1, '2026-01-01')
      `).run(),
    ).toThrow();
  });

  it('resolveAlert sets resolvedAt on most recent unresolved entry', () => {
    const e1 = makeEntry({ id: 'a1', firedAt: '2026-01-01T00:00:00Z' });
    const e2 = makeEntry({ id: 'a2', firedAt: '2026-01-02T00:00:00Z' });
    recordAlert(e1, db);
    recordAlert(e2, db);

    resolveAlert('cpu-high', db);

    const rows = db.prepare('SELECT * FROM alert_history WHERE resolved_at IS NOT NULL').all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('getAlertHistory returns entries with total', () => {
    for (let i = 0; i < 5; i++) {
      recordAlert(makeEntry({ id: `entry-${i}`, firedAt: `2026-01-0${i + 1}T00:00:00Z` }), db);
    }

    const result = getAlertHistory({ limit: 3, offset: 0 }, db);
    expect(result.entries).toHaveLength(3);
    expect(result.total).toBe(5);
  });

  it('getAlertHistory filters by ruleId', () => {
    recordAlert(makeEntry({ id: 'a1', ruleId: 'cpu-high' }), db);
    recordAlert(makeEntry({ id: 'a2', ruleId: 'ram-high' }), db);

    const result = getAlertHistory({ ruleId: 'ram-high' }, db);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].ruleId).toBe('ram-high');
    expect(result.total).toBe(1);
  });

  it('getAlertHistory filters by severity', () => {
    recordAlert(makeEntry({ id: 'a1', severity: 'warning' }), db);
    recordAlert(makeEntry({ id: 'a2', severity: 'critical' }), db);
    recordAlert(makeEntry({ id: 'a3', severity: 'info' }), db);

    const result = getAlertHistory({ severity: 'critical' }, db);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].severity).toBe('critical');
  });

  it('getAlertHistory filters by date range', () => {
    recordAlert(makeEntry({ id: 'a1', firedAt: '2026-01-01T00:00:00Z' }), db);
    recordAlert(makeEntry({ id: 'a2', firedAt: '2026-01-15T00:00:00Z' }), db);
    recordAlert(makeEntry({ id: 'a3', firedAt: '2026-02-01T00:00:00Z' }), db);

    const result = getAlertHistory({ from: '2026-01-10T00:00:00Z', to: '2026-01-20T00:00:00Z' }, db);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe('a2');
  });

  it('getActiveAlerts returns unresolved entries only', () => {
    recordAlert(makeEntry({ id: 'a1' }), db);
    recordAlert(makeEntry({ id: 'a2' }), db);

    db.prepare("UPDATE alert_history SET resolved_at = datetime('now') WHERE id = 'a1'").run();

    const active = getActiveAlerts(db);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('a2');
  });

  it('pruneHistory deletes oldest entries when over 10K', () => {
    const insert = db.prepare(`
      INSERT INTO alert_history (id, rule_id, rule_name, severity, message, metric_value, threshold_value, fired_at)
      VALUES (?, 'r1', 'test', 'info', 'msg', 1, 1, ?)
    `);

    const insertMany = db.transaction(() => {
      for (let i = 0; i < 10_005; i++) {
        const ts = new Date(2026, 0, 1, 0, 0, i).toISOString();
        insert.run(`entry-${i.toString().padStart(6, '0')}`, ts);
      }
    });
    insertMany();

    const deleted = pruneHistory(db);
    expect(deleted).toBe(5);

    const count = db.prepare('SELECT COUNT(*) as c FROM alert_history').get() as { c: number };
    expect(count.c).toBe(10_000);
  });

  it('pruneHistory returns 0 when under cap', () => {
    recordAlert(makeEntry({ id: 'a1' }), db);
    expect(pruneHistory(db)).toBe(0);
  });
});
