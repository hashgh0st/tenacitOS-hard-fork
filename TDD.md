# TDD: TenacitOS-X -- Technical Design Document

## Document Metadata
- **Author:** Dustin (hashgh0st)
- **Date:** 2026-03-28
- **Version:** 1.0.0
- **Status:** Draft
- **Companion:** PRD.md (same directory)
- **Target Runtime:** Claude Code CLI

---

## 1. Architecture Overview

TenacitOS-X preserves the upstream Next.js 16 App Router architecture and extends it with new layers. The system has four logical tiers:

```
+----------------------------------------------------------+
|                     Client (Browser/PWA)                  |
|  React 19 + Tailwind v4 + R3F + Recharts + SSE/WS       |
+----------------------------------------------------------+
         |              |              |
         v              v              v
+----------------+ +-----------+ +------------------+
| Next.js Pages  | | SSE/WS    | | Service Worker   |
| (App Router)   | | Streams   | | (PWA + Push)     |
+----------------+ +-----------+ +------------------+
         |              |              |
         v              v              v
+----------------------------------------------------------+
|               Next.js API Routes (Route Handlers)         |
|  /api/auth/*  /api/stream/*  /api/agents/*  /api/chat/*  |
|  /api/docker/*  /api/alerts/*  /api/collector/*           |
+----------------------------------------------------------+
         |              |              |
         v              v              v
+------------------+ +-----------+ +------------------+
| SQLite           | | Filesystem| | External APIs    |
| (better-sqlite3) | | (chokidar)| | (Docker, Gateway)|
+------------------+ +-----------+ +------------------+
```

### Key Design Decisions

1. **SQLite everywhere.** No PostgreSQL. Auth, audit, fleet, and alert history all use SQLite via better-sqlite3. Each concern gets its own `.db` file to keep WAL contention isolated.
2. **SSE over WebSocket for most streams.** SSE is simpler, auto-reconnects natively in browsers, and works through HTTP/2 proxies without upgrade negotiation. WebSocket reserved only for bidirectional needs (agent chat, AI chat).
3. **Event bus pattern.** A singleton in-process EventEmitter bridges data sources (filesystem watchers, SQLite pollers, Docker API) to SSE/WS connections. This decouples data collection from delivery.
4. **Layered middleware.** Auth middleware runs first (role extraction), then rate limiting, then route handler. All middleware is in `src/middleware.ts` (extending upstream).

---

## 2. Directory Structure (New and Modified)

```
tenacitOS-fork/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── agents/              # MODIFIED - add control actions
│   │   │   ├── approvals/           # NEW - approval gate UI
│   │   │   ├── alerts/              # NEW - alert rules and history
│   │   │   ├── audit/               # NEW - audit log viewer (admin)
│   │   │   ├── docker/              # NEW - Docker management
│   │   │   ├── fleet/               # NEW - multi-instance fleet view
│   │   │   ├── sessions/
│   │   │   │   └── [id]/            # NEW - session detail/replay
│   │   │   ├── actions/             # NEW - hardened action controls
│   │   │   └── users/               # NEW - user management (admin)
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/           # MODIFIED - multi-user + TOTP
│   │   │   │   ├── register/        # NEW
│   │   │   │   ├── totp/            # NEW - setup and verify
│   │   │   │   ├── invite/          # NEW
│   │   │   │   └── logout/          # MODIFIED
│   │   │   ├── stream/              # NEW - SSE endpoints
│   │   │   │   ├── system/
│   │   │   │   ├── agents/
│   │   │   │   ├── activity/
│   │   │   │   ├── notifications/
│   │   │   │   └── costs/
│   │   │   ├── agents/
│   │   │   │   ├── route.ts          # MODIFIED - add control endpoints
│   │   │   │   └── [id]/
│   │   │   │       ├── control/      # NEW - start/stop/restart
│   │   │   │       ├── message/      # NEW - send message to agent
│   │   │   │       └── model/        # NEW - hot-swap model
│   │   │   ├── chat/                 # NEW - AI ops chat
│   │   │   ├── docker/              # NEW
│   │   │   │   ├── containers/
│   │   │   │   ├── images/
│   │   │   │   └── system/
│   │   │   ├── alerts/              # NEW - CRUD alert rules
│   │   │   ├── actions/             # NEW - execute safe actions
│   │   │   ├── collector/           # NEW - fleet ingest endpoint
│   │   │   │   └── ingest/
│   │   │   ├── sessions/
│   │   │   │   └── [id]/
│   │   │   │       └── trace/       # NEW - session trace data
│   │   │   ├── users/               # NEW - user CRUD
│   │   │   ├── audit/               # NEW - audit log query
│   │   │   └── push/                # NEW - push subscription mgmt
│   │   ├── login/                    # MODIFIED - new auth UI
│   │   ├── register/                 # NEW
│   │   └── setup/                    # NEW - first-run setup
│   ├── components/
│   │   ├── TenacitOS/                # MODIFIED - add nav items, mobile nav
│   │   ├── Office3D/                 # UNCHANGED
│   │   ├── Chat/                     # NEW - AI chat drawer
│   │   ├── Approvals/                # NEW - approval cards
│   │   ├── Alerts/                   # NEW - alert rule editor
│   │   ├── Docker/                   # NEW - container cards
│   │   ├── Fleet/                    # NEW - instance cards
│   │   ├── SessionReplay/            # NEW - trace timeline
│   │   ├── Actions/                  # NEW - action cards
│   │   └── shared/
│   │       ├── ConfirmDialog.tsx      # NEW - reusable confirmation
│   │       ├── SSEProvider.tsx        # NEW - SSE context provider
│   │       ├── RoleBadge.tsx          # NEW
│   │       └── MobileNav.tsx          # NEW - bottom nav for mobile
│   ├── config/
│   │   ├── branding.ts               # UNCHANGED
│   │   └── actions.ts                # NEW - safe action definitions
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── db.ts                 # NEW - auth SQLite schema + queries
│   │   │   ├── password.ts           # NEW - Argon2id hashing
│   │   │   ├── totp.ts              # NEW - TOTP generation/verification
│   │   │   ├── session.ts           # NEW - session management
│   │   │   ├── roles.ts             # NEW - RBAC definitions
│   │   │   └── audit.ts             # NEW - audit logger
│   │   ├── events/
│   │   │   ├── bus.ts               # NEW - EventEmitter singleton
│   │   │   ├── watchers.ts          # NEW - filesystem watchers
│   │   │   └── pollers.ts           # NEW - SQLite change detection
│   │   ├── docker/
│   │   │   └── client.ts            # NEW - Docker Engine API client
│   │   ├── alerts/
│   │   │   ├── engine.ts            # NEW - alert evaluation loop
│   │   │   ├── channels.ts          # NEW - notification delivery
│   │   │   └── templates.ts         # NEW - built-in alert templates
│   │   ├── fleet/
│   │   │   ├── db.ts               # NEW - fleet SQLite schema
│   │   │   └── ingest.ts           # NEW - collector payload processing
│   │   ├── chat/
│   │   │   ├── gateway.ts          # NEW - OpenClaw gateway proxy
│   │   │   └── tools.ts            # NEW - chat tool function defs
│   │   ├── sessions/
│   │   │   └── trace.ts            # NEW - session trace parser
│   │   ├── pricing.ts               # UNCHANGED
│   │   ├── queries.ts               # MODIFIED - add fleet-aware queries
│   │   └── activity.ts              # MODIFIED - emit to event bus
│   └── hooks/
│       ├── useSSE.ts                # NEW - generic SSE hook
│       ├── useWebSocket.ts          # NEW - WS hook for chat/control
│       └── useAuth.ts               # NEW - client auth context
├── collector/                        # NEW - standalone collector script
│   ├── index.ts
│   ├── package.json
│   └── README.md
├── data/
│   ├── auth.db                      # NEW (auto-created, gitignored)
│   ├── fleet.db                     # NEW (auto-created, gitignored)
│   ├── alert-rules.json             # NEW (seeded from example)
│   ├── alert-rules.example.json     # NEW
│   ├── alert-history.json           # NEW (auto-created, gitignored)
│   └── ... (existing data files)
├── public/
│   ├── manifest.json                # NEW - PWA manifest
│   ├── sw.js                        # NEW - Service Worker
│   ├── icons/                       # NEW - PWA icons (192, 512)
│   └── models/                      # UNCHANGED
├── scripts/
│   ├── collect-usage.ts             # UNCHANGED
│   ├── setup-cron.sh                # UNCHANGED
│   └── migrate-auth.ts             # NEW - migrate from ADMIN_PASSWORD
├── middleware.ts                     # MODIFIED - multi-user auth + RBAC
└── next.config.mjs                  # MODIFIED - PWA headers
```

---

## 3. Database Schemas

### 3.1 auth.db

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
  totp_secret TEXT,              -- encrypted, NULL if MFA not enabled
  totp_enabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_login TEXT,
  is_active INTEGER DEFAULT 1
);

-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  is_remember_me INTEGER DEFAULT 0
);

-- Audit log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,        -- denormalized for retention after user delete
  action TEXT NOT NULL,          -- e.g. 'agent.restart', 'session.cancel', 'user.login'
  target TEXT,                   -- e.g. agent ID, session ID
  details TEXT,                  -- JSON blob with action-specific data
  ip_address TEXT,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical'))
);

-- Invitations
CREATE TABLE invitations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  token_hash TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT REFERENCES users(id)
);

-- Rate limiting
CREATE TABLE login_attempts (
  ip_address TEXT NOT NULL,
  attempted_at TEXT DEFAULT (datetime('now')),
  success INTEGER DEFAULT 0
);

-- Push subscriptions (for PWA push notifications)
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, endpoint)
);

-- Indexes
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address, attempted_at);
```

### 3.2 fleet.db

```sql
-- Remote instances
CREATE TABLE instances (
  id TEXT PRIMARY KEY,             -- e.g. 'vps-eu-01'
  name TEXT NOT NULL,
  api_key_hash TEXT UNIQUE NOT NULL,
  last_seen TEXT,
  status TEXT DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'unknown')),
  openclaw_version TEXT,
  os_info TEXT,                    -- JSON: {platform, release, arch}
  created_at TEXT DEFAULT (datetime('now'))
);

-- Metric snapshots from collectors
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  timestamp TEXT DEFAULT (datetime('now')),
  cpu_percent REAL,
  ram_percent REAL,
  ram_used_mb REAL,
  ram_total_mb REAL,
  disk_percent REAL,
  disk_used_gb REAL,
  disk_total_gb REAL,
  network_rx_bytes INTEGER,
  network_tx_bytes INTEGER
);

-- Agent snapshots from collectors
CREATE TABLE remote_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  model TEXT,
  status TEXT,
  active_session_id TEXT,
  token_usage_today INTEGER DEFAULT 0,
  cost_today REAL DEFAULT 0.0,
  snapshot_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_metrics_instance_time ON metrics(instance_id, timestamp);
CREATE INDEX idx_remote_agents_instance ON remote_agents(instance_id, snapshot_at);
```

---

## 4. Implementation Details by Feature

---

### 4.1 F1: SSE Streaming Layer

**Event Bus (`src/lib/events/bus.ts`):**
```typescript
// Singleton pattern -- import this everywhere
import { EventEmitter } from 'events';

type EventPayload = {
  'system:metrics': SystemMetrics;
  'agent:status': AgentStatusUpdate;
  'activity:new': ActivityEntry;
  'notification:new': Notification;
  'cost:update': CostSnapshot;
  'alert:fired': AlertEvent;
  'alert:resolved': AlertEvent;
  'docker:status': DockerStatusUpdate;
};

class EventBus extends EventEmitter {
  private static instance: EventBus;

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
      EventBus.instance.setMaxListeners(100);
    }
    return EventBus.instance;
  }
}

export const eventBus = EventBus.getInstance();
```

**Filesystem Watchers (`src/lib/events/watchers.ts`):**
- Use `chokidar` to watch:
  - `${OPENCLAW_DIR}/openclaw.json` -- agent config changes
  - `${OPENCLAW_DIR}/workspace*/MEMORY.md` -- memory file changes
  - `data/activities.json` -- activity feed updates
  - `data/notifications.json` -- notification updates
- On change, read the file, diff against last known state, and emit appropriate events to the bus

**System Metrics Poller (`src/lib/events/pollers.ts`):**
- Use `os` module for CPU/RAM
- Use `child_process.execFile` for disk (`df`) and network (`cat /proc/net/dev` on Linux, `netstat` on macOS)
- PM2 status via `pm2 jlist` (if PM2 is available)
- Poll interval: 2 seconds for system, 5 seconds for agents
- Emit to event bus

**SSE Route Handler Pattern:**
```typescript
// src/app/api/stream/system/route.ts
import { eventBus } from '@/lib/events/bus';

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const handler = (data: SystemMetrics) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };
      eventBus.on('system:metrics', handler);

      // Send initial state immediately
      const initial = getCurrentSystemMetrics();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initial)}\n\n`)
      );

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        eventBus.off('system:metrics', handler);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Client Hook (`src/hooks/useSSE.ts`):**
```typescript
export function useSSE<T>(endpoint: string): {
  data: T | null;
  error: Error | null;
  status: 'connecting' | 'connected' | 'error';
} {
  // EventSource with auto-reconnect
  // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
  // After 3 consecutive failures, fall back to fetch polling
  // Returns latest data via useState
}
```

**Dependencies to add:**
- `chokidar` (filesystem watching)

---

### 4.2 F2: Agent Control

**Gateway API Integration:**
OpenClaw gateway exposes HTTP endpoints. TenacitOS-X proxies through its own API routes (which enforce auth + RBAC).

| Dashboard Route | Gateway Endpoint | Method |
|---|---|---|
| `/api/agents/[id]/control` | `POST /api/agents/{id}/start\|stop\|restart` | POST |
| `/api/agents/[id]/message` | `POST /api/agents/{id}/message` | POST |
| `/api/agents/[id]/model` | `PATCH /api/agents/{id}/config` | PATCH |

**Approval System:**
- OpenClaw gateway emits approval requests via its event stream
- TenacitOS-X subscribes to the gateway's SSE endpoint for approval events
- Incoming approvals stored in `data/approvals.json` (or a new `approvals` table in `auth.db`)
- Approval response sent back to gateway: `POST /api/approvals/{id}/respond`
- Auto-deny after configurable timeout (default 30 minutes)

**Confirmation Dialog Component (`src/components/shared/ConfirmDialog.tsx`):**
```typescript
interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;           // if true, requires typing target name
  destructiveTarget?: string;      // e.g. agent name
  onConfirm: () => void;
  onCancel: () => void;
}
```

**Role Requirements:**
- `viewer`: Cannot access any control endpoints
- `operator`: Can start/stop/restart agents, approve/deny, send messages
- `admin`: All operator permissions + user management

---

### 4.3 F3: Multi-User Auth

**Password Hashing (`src/lib/auth/password.ts`):**
- Primary: Argon2id via `argon2` npm package
  - Parameters: memoryCost=65536 (64MB), timeCost=3, parallelism=4
- Fallback: PBKDF2 via Node.js `crypto` module (if argon2 native addon fails to build)
  - Parameters: iterations=600000, keyLen=64, digest='sha512'

**TOTP (`src/lib/auth/totp.ts`):**
- Use `otpauth` npm package
- 6-digit codes, 30-second window, SHA-1 (standard Google Authenticator compat)
- QR code generation via `qrcode` npm package (data URL, no external service)
- Backup codes: 10 single-use codes generated at TOTP setup, stored hashed

**Session Management (`src/lib/auth/session.ts`):**
- Session token: 32 bytes random, stored as SHA-256 hash in DB
- Cookie: `tenacitos_session`, httpOnly, sameSite=lax, secure in production
- Session validation on every request via middleware
- Cleanup: expired sessions purged every hour via background interval

**Middleware Changes (`middleware.ts`):**
```typescript
// Execution order:
// 1. Check if route is public (/api/auth/login, /api/health, /login, /setup)
// 2. Extract session cookie
// 3. Validate session in auth.db
// 4. Attach user context (id, username, role) to request headers
// 5. Check route-level role requirements
// 6. Rate limit check (per-user for authenticated, per-IP for public)
// 7. Pass to route handler
```

**Backward Compatibility:**
```typescript
// On startup (src/lib/auth/db.ts init):
// 1. If auth.db does not exist:
//    a. If ADMIN_PASSWORD is set: create auth.db, create admin user with that password
//    b. If ADMIN_PASSWORD is not set: redirect all routes to /setup (first-run wizard)
// 2. If auth.db exists: use it (ignore ADMIN_PASSWORD even if still in env)
```

**Dependencies to add:**
- `argon2` (password hashing)
- `otpauth` (TOTP generation/verification)
- `qrcode` (QR code generation)

---

### 4.4 F4: AI Chat

**Gateway Proxy (`src/lib/chat/gateway.ts`):**
```typescript
// The OpenClaw gateway runs locally and exposes a chat API
// Default: http://localhost:3001 (configurable via GATEWAY_URL env)

interface ChatRequest {
  message: string;
  tools?: ToolDefinition[];   // dashboard context tools
  history?: ChatMessage[];
}

async function sendToGateway(req: ChatRequest): Promise<ReadableStream> {
  // Stream response from gateway
  // Add system prompt with dashboard context
  // Include tool definitions for dashboard queries
}
```

**System Prompt Template:**
```
You are the TenacitOS-X operations assistant. You have access to the following
dashboard tools to answer questions about agent operations, costs, and system health.

Current dashboard state:
- Active agents: {agent_count}
- Total cost today: ${cost_today}
- System: CPU {cpu}%, RAM {ram}%, Disk {disk}%
- Active alerts: {alert_count}

Use the provided tools to look up specific data. Be concise and operational.
```

**WebSocket Route:**
- `/api/chat` uses WebSocket for bidirectional streaming
- Client sends messages, server streams response tokens
- Conversation history maintained in client state (not persisted server-side by default)

---

### 4.5 F5: Docker Management

**Docker Client (`src/lib/docker/client.ts`):**
```typescript
// Communicate with Docker Engine API via Unix socket
// Using raw HTTP over Unix socket (no Docker SDK dependency to keep it lightweight)

const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

async function dockerRequest(path: string, method = 'GET', body?: unknown) {
  // HTTP request over Unix socket using Node's http module
  // Returns parsed JSON response
}

// Endpoints used:
// GET  /containers/json?all=true     -- list containers
// GET  /containers/{id}/logs         -- container logs (stream)
// POST /containers/{id}/start        -- start container
// POST /containers/{id}/stop         -- stop container
// POST /containers/{id}/restart      -- restart container
// GET  /images/json                  -- list images
// GET  /system/df                    -- disk usage
// GET  /version                      -- Docker version
// POST /containers/prune             -- prune stopped
// POST /images/prune                 -- prune dangling
```

**Graceful Degradation:**
- On startup, attempt to connect to Docker socket
- If unavailable: set `dockerAvailable = false` globally
- Docker page shows "Docker not detected" message
- System Monitor omits Docker panel
- No errors thrown, no retries (check once on startup, re-check on manual refresh)

---

### 4.6 F6: Alert Engine

**Evaluation Loop (`src/lib/alerts/engine.ts`):**
```typescript
// Runs every 10 seconds
// 1. Load alert rules from data/alert-rules.json
// 2. For each enabled rule:
//    a. Fetch current metric value
//    b. Evaluate condition
//    c. Check sustained_checks threshold
//    d. If triggered and not in cooldown: fire alert
//    e. If previously triggered and condition cleared: resolve
// 3. Write state to in-memory map (not persisted -- restarts reset)

interface AlertRule {
  id: string;
  name: string;
  condition: {
    metric: string;           // dot-notation path e.g. 'cost.daily.total'
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    value: number;
  };
  sustained_checks: number;   // must fail N consecutive checks before firing
  cooldown_minutes: number;    // suppress re-fire for this duration
  channels: ('in_app' | 'webhook' | 'telegram' | 'email')[];
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  webhook_url?: string;
  telegram_chat_id?: string;
}
```

**Metric Registry:**
```typescript
// Maps metric paths to resolver functions
const metricResolvers: Record<string, () => Promise<number>> = {
  'system.cpu': async () => getCurrentCPU(),
  'system.ram': async () => getCurrentRAM(),
  'system.disk': async () => getCurrentDisk(),
  'cost.daily.total': async () => getTodayCost(),
  'cost.daily.agent.*': async (agentId) => getTodayCost(agentId),
  'agent.idle_minutes.*': async (agentId) => getAgentIdleMinutes(agentId),
  'cron.missed': async () => getMissedCronCount(),
  'gateway.status': async () => getGatewayHealth(),  // 1 = healthy, 0 = down
};
```

**Notification Delivery (`src/lib/alerts/channels.ts`):**
- `in_app`: Write to `data/notifications.json` and emit to event bus
- `webhook`: `fetch(url, { method: 'POST', body: JSON.stringify(payload) })`
- `telegram`: `fetch(https://api.telegram.org/bot${token}/sendMessage, ...)`
- `email`: Use `nodemailer` with SMTP config from env vars
- All deliveries are fire-and-forget with error logging (no retry queue to keep it simple)

**Dependencies to add:**
- `nodemailer` (optional, for email alerts)

---

### 4.7 F7: Session Replay

**Trace Parser (`src/lib/sessions/trace.ts`):**
```typescript
// OpenClaw stores session data in SQLite databases per workspace
// Tables: messages, tool_calls, context_windows

interface TraceStep {
  id: string;
  timestamp: string;
  type: 'user_message' | 'assistant_message' | 'reasoning' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  token_count?: { input: number; output: number };
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: string;
  file_path?: string;
  file_diff?: { before: string; after: string };
  duration_ms?: number;
  model?: string;
}

async function getSessionTrace(sessionId: string, agentId: string): Promise<TraceStep[]> {
  // 1. Locate the correct workspace SQLite DB
  // 2. Query messages + tool_calls tables joined by session_id
  // 3. Order by timestamp
  // 4. Parse tool call results for file operations, extract diffs
  // 5. Return ordered trace steps
}
```

**Session Detail Page:**
- URL: `/sessions/[id]`
- Components:
  - `SessionSummaryBar` -- total tokens, cost, duration, model, tool count
  - `TraceTimeline` -- vertical timeline of TraceStep items
  - `TraceStepCard` -- expandable card per step with syntax highlighting
  - `FileDiffViewer` -- unified diff renderer (use `diff` npm package)
- Pagination: load 20 steps at a time, infinite scroll for more

**Dependencies to add:**
- `diff` (for computing and rendering file diffs)

---

### 4.8 F8: Fleet Collector

**Collector Script (`collector/index.ts`):**
```typescript
// Standalone script, runs on remote VPS instances
// Packaged as its own mini npm package inside the repo

// 1. Read local OPENCLAW_DIR (same logic as main dashboard)
// 2. Collect: system metrics, agent list, session summaries, cost snapshot
// 3. POST to central dashboard: TENACITOS_CENTRAL_URL/api/collector/ingest
// 4. Headers: Authorization: Bearer TENACITOS_API_KEY
// 5. Sleep TENACITOS_PUSH_INTERVAL seconds
// 6. Repeat

interface CollectorPayload {
  instance_name: string;
  timestamp: string;
  system: {
    cpu_percent: number;
    ram_percent: number;
    ram_used_mb: number;
    ram_total_mb: number;
    disk_percent: number;
    disk_used_gb: number;
    disk_total_gb: number;
    network_rx_bytes: number;
    network_tx_bytes: number;
    openclaw_version: string;
    os: { platform: string; release: string; arch: string };
  };
  agents: {
    id: string;
    name: string;
    model: string;
    status: string;
    active_session_id: string | null;
    token_usage_today: number;
    cost_today: number;
  }[];
}
```

**Ingest Endpoint (`/api/collector/ingest`):**
```typescript
// 1. Validate API key against instances table
// 2. Upsert instance record (update last_seen, status='online')
// 3. Insert metrics row
// 4. Upsert remote_agents rows
// 5. Check if any metrics trigger fleet-level alerts
// 6. Return 200 OK
```

**Instance Lifecycle:**
- A background job runs every 60 seconds
- Any instance where `last_seen` is older than `2 * push_interval` is marked `offline`
- Offline instances emit an alert event

---

### 4.9 F9: PWA

**manifest.json:**
```json
{
  "name": "TenacitOS-X Mission Control",
  "short_name": "TenacitOS-X",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#f97316",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Service Worker (`public/sw.js`):**
- App shell caching strategy: cache HTML, CSS, JS, fonts on install
- Data requests (API calls): network-first with no cache fallback
- When offline: show cached shell with "offline" banner
- Push event handler: show notification, on click open relevant page

**Push Notification Integration:**
- Uses Web Push API with VAPID keys
- VAPID keys generated on first setup, stored in `.env.local`
- Push subscriptions stored in `auth.db` `push_subscriptions` table
- Alert engine (F6) calls `web-push` library to send to all subscribed users

**Responsive Breakpoints:**
- `sm` (< 640px): Mobile. Bottom nav, stacked cards, no 3D office
- `md` (640-1024px): Tablet. Side nav collapsed, 2-column grids
- `lg` (> 1024px): Desktop. Full side nav, 3-4 column grids, 3D office

**Dependencies to add:**
- `web-push` (VAPID push notifications)

---

### 4.10 F10: Safe Action Controls

**Action Definitions (`src/config/actions.ts`):**
```typescript
interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  category: 'gateway' | 'data' | 'system' | 'maintenance';
  icon: string;                    // Lucide icon name
  command: string;                 // exact command to run
  args: string[];                  // exact args (no interpolation)
  role: 'viewer' | 'operator';    // minimum role required
  destructive: boolean;            // requires confirmation dialog
  timeout_ms: number;              // kill if exceeds this
  stream_output: boolean;          // stream stdout to UI via SSE
}

export const ACTIONS: ActionDefinition[] = [
  {
    id: 'gateway-status',
    name: 'Check Gateway Status',
    description: 'Query the OpenClaw gateway health endpoint',
    category: 'gateway',
    icon: 'Activity',
    command: 'openclaw',
    args: ['status', '--json'],
    role: 'viewer',
    destructive: false,
    timeout_ms: 10000,
    stream_output: false,
  },
  {
    id: 'gateway-restart',
    name: 'Restart Gateway',
    description: 'Restart the OpenClaw gateway service',
    category: 'gateway',
    icon: 'RefreshCw',
    command: 'systemctl',
    args: ['--user', 'restart', 'openclaw-gateway.service'],
    role: 'operator',
    destructive: true,
    timeout_ms: 30000,
    stream_output: true,
  },
  {
    id: 'collect-usage',
    name: 'Collect Usage Data',
    description: 'Run the usage collection script to update cost data',
    category: 'data',
    icon: 'Database',
    command: 'npx',
    args: ['tsx', 'scripts/collect-usage.ts'],
    role: 'operator',
    destructive: false,
    timeout_ms: 60000,
    stream_output: true,
  },
  // ... more actions defined here
];
```

**Execution API (`/api/actions/route.ts`):**
```typescript
// POST /api/actions
// Body: { actionId: string }
// 1. Look up action by ID in ACTIONS array (never accept arbitrary commands)
// 2. Check user role >= action.role
// 3. Spawn child_process.execFile (NOT exec -- no shell expansion)
// 4. If stream_output: pipe stdout to SSE stream
// 5. On completion: return exit code + output
// 6. Log to audit trail
// 7. If timeout exceeded: SIGKILL and return error
```

---

## 5. New Dependencies Summary

| Package | Purpose | Phase |
|---|---|---|
| `chokidar` | Filesystem watching for event bus | 1 |
| `argon2` | Password hashing (Argon2id) | 1 |
| `otpauth` | TOTP generation and verification | 1 |
| `qrcode` | QR code generation for TOTP setup | 1 |
| `diff` | File diff computation for session replay | 3 |
| `web-push` | VAPID push notifications for PWA | 4 |
| `nodemailer` | Email alert delivery (optional) | 2 |

All packages are MIT or Apache-2.0 licensed. No native addons except `argon2` (which has PBKDF2 fallback). Total added dependency weight estimated at ~2MB node_modules.

---

## 6. API Route Summary

### Public (no auth)
| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Health check (upstream) |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register (with invitation token) |
| POST | `/api/auth/totp/verify` | Verify TOTP code during login |
| POST | `/api/collector/ingest` | Fleet collector ingest (API key auth) |

### Viewer (minimum)
| Method | Route | Description |
|---|---|---|
| GET | `/api/stream/*` | All SSE streams |
| GET | `/api/agents` | Agent list |
| GET | `/api/sessions` | Session list |
| GET | `/api/sessions/[id]/trace` | Session trace |
| GET | `/api/costs/*` | Cost data |
| GET | `/api/docker/containers` | Docker container list |
| GET | `/api/docker/images` | Docker image list |
| GET | `/api/docker/system` | Docker system info |
| GET | `/api/alerts` | Alert rules and history |
| GET | `/api/fleet` | Fleet instance list |
| POST | `/api/actions` | Execute viewer-level actions |
| POST | `/api/chat` | AI chat (read-only mode) |

### Operator
| Method | Route | Description |
|---|---|---|
| POST | `/api/agents/[id]/control` | Start/stop/restart agent |
| POST | `/api/agents/[id]/message` | Send message to agent |
| PATCH | `/api/agents/[id]/model` | Hot-swap model |
| POST | `/api/approvals/[id]/respond` | Approve/deny action |
| POST | `/api/docker/containers/[id]/*` | Docker lifecycle controls |
| POST | `/api/docker/prune` | Docker prune |
| PUT | `/api/alerts` | Create/update alert rules |
| DELETE | `/api/alerts/[id]` | Delete alert rule |
| POST | `/api/actions` | Execute operator-level actions |
| POST | `/api/chat` | AI chat (operator mode) |

### Admin
| Method | Route | Description |
|---|---|---|
| GET | `/api/users` | User list |
| POST | `/api/users/invite` | Generate invitation |
| PATCH | `/api/users/[id]` | Update user role/status |
| DELETE | `/api/users/[id]` | Deactivate user |
| GET | `/api/audit` | Audit log query |
| GET | `/api/fleet/keys` | Manage collector API keys |
| POST | `/api/fleet/keys` | Generate new collector key |

---

## 7. Environment Variables (New)

```env
# --- Auth (new system) ---
# These replace ADMIN_PASSWORD for multi-user mode
# ADMIN_PASSWORD still works for backward compat on first boot

# --- Gateway ---
GATEWAY_URL=http://localhost:3001    # OpenClaw gateway endpoint

# --- Docker ---
DOCKER_SOCKET=/var/run/docker.sock   # Docker Engine API socket

# --- Fleet ---
# (collector API keys are generated in the UI, not env vars)

# --- Alerts ---
TELEGRAM_BOT_TOKEN=                  # For Telegram alert channel
SMTP_HOST=                           # For email alerts
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=tenacitos@yourdomain.com

# --- PWA Push ---
VAPID_PUBLIC_KEY=                    # Generated on first setup
VAPID_PRIVATE_KEY=                   # Generated on first setup
VAPID_EMAIL=mailto:admin@yourdomain.com
```

---

## 8. Testing Strategy

### Unit Tests
- Auth: password hashing, TOTP generation/verification, session creation/validation
- Alert engine: condition evaluation, cooldown logic, sustained check counting
- Trace parser: SQLite query result to TraceStep mapping
- Fleet ingest: payload validation, metric insertion
- Docker client: response parsing (mock socket)

### Integration Tests
- Auth flow: register, login, TOTP, session, logout
- SSE streams: connect, receive events, reconnect on drop
- Agent control: proxy to gateway mock, verify audit logging
- Alert lifecycle: threshold cross, fire, cooldown, resolve

### E2E Tests (Playwright)
- First-run setup wizard
- Login with TOTP
- Dashboard loads with live data
- Agent restart flow with confirmation dialog
- Alert rule creation and trigger
- Mobile responsive layouts

### Test Framework
- Vitest for unit and integration
- Playwright for E2E
- MSW (Mock Service Worker) for API mocking

---

## 9. Migration Guide (from upstream)

```bash
# 1. Fork and clone
git clone https://github.com/hashgh0st/tenacitOS-fork.git mission-control
cd mission-control

# 2. Install (new deps will be added)
npm install

# 3. Copy existing config
cp /path/to/old/.env.local .env.local

# 4. Initialize new data files
cp data/alert-rules.example.json data/alert-rules.json

# 5. First boot -- auto-migrates auth
# If ADMIN_PASSWORD is set, creates admin user automatically
# Prints one-time migration message to console
npm run dev

# 6. (Optional) Generate VAPID keys for PWA push
npx web-push generate-vapid-keys
# Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env.local

# 7. Build for production
npm run build
npm start
```

---

## 10. Security Considerations

1. **No shell execution.** All child processes use `execFile` (no shell interpolation). Action commands are defined in code, not user input.
2. **SQL injection prevention.** All SQLite queries use parameterized statements via better-sqlite3's built-in binding.
3. **TOTP secrets encrypted at rest.** AES-256-GCM with `AUTH_SECRET` as the key derivation input.
4. **Rate limiting everywhere.** Login: 5/15min per IP. API: 60/min per user. Chat: 20/min per user. Actions: 10/min per user. Collector ingest: 120/min per API key.
5. **Collector auth is separate.** Fleet API keys are not user sessions. Compromised collector key cannot access the dashboard UI.
6. **Docker socket access is opt-in.** Dashboard never assumes Docker is available. Socket path is configurable.
7. **Push subscriptions are per-user.** A user can only manage their own push subscriptions.
8. **Audit trail is append-only.** No API to delete audit entries. Retention-based cleanup only.
9. **CSP headers.** Next.js config adds Content-Security-Policy restricting inline scripts and external resources.
10. **Gateway proxy validates responses.** Chat responses from the gateway are sanitized before rendering (no raw HTML injection).

---

## 11. Performance Budget

| Metric | Target | Strategy |
|---|---|---|
| Initial JS bundle | < 300KB (gzipped) | Dynamic imports for 3D office, Docker, Fleet pages |
| SSE memory per client | < 1MB | Event bus fan-out with backpressure |
| SQLite query time | < 50ms | Indexes on all query columns, EXPLAIN QUERY PLAN validation |
| Dashboard cold load | < 2s | SSR for shell, SSE for live data |
| Session trace (100 steps) | < 2s | Paginated loading, virtual scroll |
| Alert evaluation cycle | < 500ms | Cached metric resolvers, debounced writes |
| Collector payload size | < 10KB | Compact JSON, no redundant data |

---

## 12. Handoff Notes for Claude Code CLI

- Start with Phase 1 (F1 + F3 + F10). These are foundational and unblock everything else.
- F1 (SSE) should be built first since F6 (alerts) and F2 (agent control) depend on it.
- F3 (auth) should be built second since all control features depend on RBAC.
- Test the event bus thoroughly before building SSE endpoints. Memory leaks from orphaned listeners are the #1 risk.
- The Docker client should not import any Docker SDK. Raw HTTP over Unix socket keeps it lightweight.
- The collector script must be independently runnable with zero dashboard dependencies. It has its own package.json.
- All new pages should follow the existing pattern: `src/app/(dashboard)/page-name/page.tsx` with the TenacitOS shell layout.
- Tailwind v4 is already configured upstream. Use its utility classes. No new CSS files.
- The 3D Office is the heaviest page. Do not add React Three Fiber imports to any other page.
- Keep all data files in the `data/` directory with `.example` counterparts committed and real files gitignored.
