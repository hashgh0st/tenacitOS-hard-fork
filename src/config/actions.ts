/**
 * Action Registry — predefined safe actions for the Quick Actions Hub.
 *
 * SECURITY: All commands are statically defined. No user input is interpolated
 * into command or args. Execution uses execFile (no shell expansion).
 */

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  category: 'gateway' | 'data' | 'system' | 'maintenance';
  icon: string;           // Lucide icon name
  command: string;         // exact command to run
  args: string[];          // exact args (no interpolation)
  role: 'viewer' | 'operator'; // minimum role required
  destructive: boolean;    // requires confirmation dialog
  timeout_ms: number;      // kill if exceeds this
  stream_output: boolean;  // stream stdout to UI via SSE
}

export const ACTIONS: readonly ActionDefinition[] = [
  // ── Gateway ───────────────────────────────────────────────────────────────
  {
    id: 'gateway-status',
    name: 'Gateway Status',
    description: 'Check gateway health and connection status',
    category: 'gateway',
    icon: 'Activity',
    command: 'openclaw',
    args: ['status', '--json'],
    role: 'viewer',
    destructive: false,
    timeout_ms: 10_000,
    stream_output: false,
  },
  {
    id: 'gateway-restart',
    name: 'Restart Gateway',
    description: 'Restart the OpenClaw gateway service',
    category: 'gateway',
    icon: 'RotateCcw',
    command: 'systemctl',
    args: ['--user', 'restart', 'openclaw-gateway.service'],
    role: 'operator',
    destructive: true,
    timeout_ms: 30_000,
    stream_output: true,
  },
  {
    id: 'gateway-logs',
    name: 'Gateway Logs',
    description: 'View recent gateway log entries',
    category: 'gateway',
    icon: 'FileText',
    command: 'journalctl',
    args: ['--user', '-u', 'openclaw-gateway', '--no-pager', '-n', '100'],
    role: 'viewer',
    destructive: false,
    timeout_ms: 10_000,
    stream_output: false,
  },

  // ── Data ──────────────────────────────────────────────────────────────────
  {
    id: 'collect-usage',
    name: 'Collect Usage',
    description: 'Run usage data collection script',
    category: 'data',
    icon: 'BarChart3',
    command: 'npx',
    args: ['tsx', 'scripts/collect-usage.ts'],
    role: 'operator',
    destructive: false,
    timeout_ms: 60_000,
    stream_output: true,
  },

  // ── System ────────────────────────────────────────────────────────────────
  {
    id: 'system-info',
    name: 'System Info',
    description: 'Show operating system and kernel information',
    category: 'system',
    icon: 'Monitor',
    command: 'uname',
    args: ['-a'],
    role: 'viewer',
    destructive: false,
    timeout_ms: 5_000,
    stream_output: false,
  },
  {
    id: 'disk-usage',
    name: 'Disk Usage',
    description: 'Check disk space usage across filesystems',
    category: 'system',
    icon: 'HardDrive',
    command: 'df',
    args: ['-h'],
    role: 'viewer',
    destructive: false,
    timeout_ms: 5_000,
    stream_output: false,
  },
  {
    id: 'pm2-list',
    name: 'PM2 Processes',
    description: 'View all PM2 managed processes',
    category: 'system',
    icon: 'Cpu',
    command: 'pm2',
    args: ['jlist'],
    role: 'viewer',
    destructive: false,
    timeout_ms: 10_000,
    stream_output: false,
  },

  // ── Maintenance ───────────────────────────────────────────────────────────
  {
    id: 'clear-cache',
    name: 'Clear Build Cache',
    description: 'Remove Next.js build cache (.next directory)',
    category: 'maintenance',
    icon: 'Trash2',
    command: 'rm',
    args: ['-rf', '.next'],
    role: 'operator',
    destructive: true,
    timeout_ms: 15_000,
    stream_output: false,
  },
  {
    id: 'backup-data',
    name: 'Backup Data',
    description: 'Create a compressed backup of the data directory',
    category: 'maintenance',
    icon: 'Archive',
    command: 'tar',
    args: ['-czf', 'data-backup.tar.gz', 'data'],
    role: 'operator',
    destructive: false,
    timeout_ms: 60_000,
    stream_output: true,
  },
] as const;

/**
 * Look up an action by its ID. Returns undefined if not found.
 */
export function getActionById(id: string): ActionDefinition | undefined {
  return ACTIONS.find((a) => a.id === id);
}

/**
 * Category metadata for UI grouping.
 */
export const CATEGORIES = {
  gateway: { label: 'Gateway', color: '#60A5FA' },
  data: { label: 'Data', color: '#C084FC' },
  system: { label: 'System', color: '#4ADE80' },
  maintenance: { label: 'Maintenance', color: '#F59E0B' },
} as const;

export type ActionCategory = keyof typeof CATEGORIES;
