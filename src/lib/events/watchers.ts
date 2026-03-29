/**
 * Filesystem watchers for real-time change detection.
 *
 * Uses chokidar v5 to watch JSON data files and agent config,
 * diffs against last known state, and emits new entries to the event bus.
 *
 * Watched files:
 *   - OPENCLAW_CONFIG (openclaw.json) -> agent:status
 *   - data/activities.json            -> activity:new
 *   - data/notifications.json         -> notification:new
 */
import fs from 'fs';
import path from 'path';
import { watch, type FSWatcher } from 'chokidar';
import { emitEvent } from './bus';
import type { ActivityEntry, Notification } from './bus';
import { OPENCLAW_CONFIG } from '@/lib/paths';

// ── Paths ──────────────────────────────────────────────────────────────────

const ACTIVITIES_PATH = path.join(process.cwd(), 'data', 'activities.json');
const NOTIFICATIONS_PATH = path.join(process.cwd(), 'data', 'notifications.json');

// ── Last-known state snapshots ─────────────────────────────────────────────

let lastActivities: ActivityEntry[] = [];
let lastNotifications: Notification[] = [];

// ── JSON reading helpers ───────────────────────────────────────────────────

function readJsonArray<T>(filePath: string): T[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ── Diff and emit ──────────────────────────────────────────────────────────

function diffActivities(filePath: string): void {
  const current = readJsonArray<ActivityEntry>(filePath);

  if (current.length <= lastActivities.length) {
    // No new entries (or file was truncated)
    lastActivities = current;
    return;
  }

  // Build a Set of known IDs for O(1) lookup
  const knownIds = new Set(lastActivities.map((a) => a.id));

  // Find entries present in current but not in previous snapshot.
  // Activities are prepended (newest first), so new entries are at the front.
  const newEntries: ActivityEntry[] = [];
  for (const entry of current) {
    if (!knownIds.has(entry.id)) {
      newEntries.push(entry);
    }
  }

  // Emit each new entry (oldest first for chronological order)
  for (const entry of newEntries.reverse()) {
    emitEvent('activity:new', entry);
  }

  lastActivities = current;
}

function diffNotifications(filePath: string): void {
  const current = readJsonArray<Notification>(filePath);

  if (current.length <= lastNotifications.length) {
    lastNotifications = current;
    return;
  }

  const knownIds = new Set(lastNotifications.map((n) => n.id));

  const newEntries: Notification[] = [];
  for (const entry of current) {
    if (!knownIds.has(entry.id)) {
      newEntries.push(entry);
    }
  }

  for (const entry of newEntries.reverse()) {
    emitEvent('notification:new', entry);
  }

  lastNotifications = current;
}

function handleAgentConfigChange(): void {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG, 'utf-8');
    const config = JSON.parse(raw);
    const agents = [];
    if (Array.isArray(config.agents)) {
      for (const a of config.agents) {
        agents.push({
          id: a.id ?? a.name ?? 'unknown',
          name: a.name ?? a.id ?? 'unnamed',
          model: a.model ?? 'unknown',
          status: a.status ?? 'idle',
          lastSeen: a.lastSeen,
        });
      }
    } else if (config.name || config.id) {
      agents.push({
        id: config.id ?? config.name ?? 'default',
        name: config.name ?? config.id ?? 'default',
        model: config.model ?? 'unknown',
        status: config.status ?? 'idle',
        lastSeen: config.lastSeen,
      });
    }
    emitEvent('agent:status', { agents });
  } catch {
    // Config file may be mid-write or invalid; ignore
  }
}

// ── Watcher management ─────────────────────────────────────────────────────

const watchers: FSWatcher[] = [];

const CHOKIDAR_OPTS = {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50,
  },
};

function watchFile(
  filePath: string,
  onChange: (path: string) => void,
): FSWatcher | null {
  // Only watch files that exist (or whose parent directory exists)
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    return null;
  }

  const watcher = watch(filePath, CHOKIDAR_OPTS);
  watcher.on('change', onChange);
  watcher.on('add', onChange);
  watcher.on('error', () => {
    // Swallow — watcher will keep trying
  });
  return watcher;
}

export function startWatchers(): void {
  if (watchers.length > 0) return; // already running

  // Take initial snapshots so we can diff later
  lastActivities = readJsonArray<ActivityEntry>(ACTIVITIES_PATH);
  lastNotifications = readJsonArray<Notification>(NOTIFICATIONS_PATH);

  // Activities watcher
  const aw = watchFile(ACTIVITIES_PATH, () => diffActivities(ACTIVITIES_PATH));
  if (aw) watchers.push(aw);

  // Notifications watcher
  const nw = watchFile(NOTIFICATIONS_PATH, () => diffNotifications(NOTIFICATIONS_PATH));
  if (nw) watchers.push(nw);

  // Agent config watcher
  const cw = watchFile(OPENCLAW_CONFIG, () => handleAgentConfigChange());
  if (cw) watchers.push(cw);
}

export async function stopWatchers(): Promise<void> {
  await Promise.all(watchers.map((w) => w.close()));
  watchers.length = 0;
  lastActivities = [];
  lastNotifications = [];
}

// Exported for testing
export { diffActivities as _diffActivities };
export { diffNotifications as _diffNotifications };
export { handleAgentConfigChange as _handleAgentConfigChange };
export { readJsonArray as _readJsonArray };
export { ACTIVITIES_PATH as _ACTIVITIES_PATH };
export { NOTIFICATIONS_PATH as _NOTIFICATIONS_PATH };
