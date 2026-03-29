# PRD: TenacitOS-X -- OpenClaw Mission Control (Enhanced Fork)

## Document Metadata
- **Author:** Dustin (hashgh0st)
- **Date:** 2026-03-28
- **Version:** 1.0.0
- **Status:** Draft
- **Base Project:** https://github.com/carlosazaustre/tenacitOS (MIT License)
- **Fork Rationale:** Upstream inactive 30+ days. This fork adds 10 major capability areas to transform TenacitOS from a read-only monitoring dashboard into a full agent operations platform.

---

## 1. Executive Summary

TenacitOS is a Next.js 16 / React 19 real-time dashboard for OpenClaw AI agent instances. It reads agent config, sessions, memory, and logs directly from the host filesystem and SQLite databases. The current version (v0.1.x) is observation-only with basic password auth.

TenacitOS-X extends the upstream with:
1. Real-time WebSocket/SSE streaming
2. Agent interaction and lifecycle control
3. TOTP/MFA multi-user authentication
4. AI-powered conversational ops chat
5. Docker container management
6. Configurable alerting and thresholds
7. Session replay and agent trace inspection
8. Multi-instance remote agent support
9. Mobile PWA with push notifications
10. Hardened action controls (replacing read-only terminal)

The goal is a production-grade OpenClaw operations platform that a team can rely on for day-to-day agent fleet management.

---

## 2. Problem Statement

### Current Limitations (upstream TenacitOS v0.1.x)
- **Polling-only data:** API routes read filesystem/SQLite on each request. No live streaming. Activity feed and system monitor go stale between refreshes.
- **No agent control:** Dashboard is read-only. Terminal is explicitly read-only with allowlisted commands. No way to pause, message, restart, or approve agent actions.
- **Single shared password:** One `ADMIN_PASSWORD` env var. No per-user accounts, no MFA, no audit trail of who did what.
- **No alerting:** Cost tracking exists but no proactive notifications. Community reports of $60 runaway bills that could have been caught with a simple threshold.
- **No session depth:** Session history shows token counts but not the reasoning chain, tool calls, or files touched during a session.
- **Single-host only:** Reads from local `OPENCLAW_DIR`. No way to monitor agents on remote VPS instances from one dashboard.
- **Desktop-only UX:** Screenshots show desktop-optimized layouts. No PWA, no push notifications, no mobile-first views.
- **No AI self-query:** Operators must navigate pages to find answers. No way to ask "what did Studio spend yesterday?" in natural language.
- **No Docker visibility:** Many OpenClaw deployments use Docker. System Monitor shows PM2 but no container status.

### Competitive Landscape
- **openclaw-dashboard (tugcantopaloglu):** Has TOTP MFA, Docker management, config editor, security dashboard. No 3D office, no cost analytics depth.
- **openclaw-dashboard (mudrii):** Zero-dependency, AI chat, 6 themes, gateway runtime observability. No auth, no agent control.
- **openclaw-mission-control (abhi1693):** Full CRUD agent lifecycle, approval gates, governance flows, API-first. Heavy, requires PostgreSQL.
- **Crabwalk:** Lightweight companion monitor. Low memory. No control, no scheduling.
- **ClawPulse:** SaaS monitoring. Not self-hosted.

TenacitOS-X targets the gap: a single self-hosted dashboard that combines monitoring depth (costs, sessions, memory, 3D office) with operational control (agent lifecycle, approvals, alerts) and modern auth, without requiring PostgreSQL or external SaaS.

---

## 3. Goals and Non-Goals

### Goals
- G1: Real-time data streaming with sub-second latency for system metrics, agent status, and activity feed
- G2: Bidirectional agent control (pause, resume, message, approve/deny, restart) through the OpenClaw gateway API
- G3: Multi-user authentication with TOTP MFA, per-user sessions, and full audit logging
- G4: Natural language ops chat powered by the local OpenClaw gateway
- G5: Docker container visibility and basic lifecycle controls (start/stop/restart)
- G6: Configurable alert thresholds with multi-channel notification delivery (in-app, webhook, Telegram)
- G7: Session detail view with full tool call trace, reasoning chain, and file diff inspection
- G8: Lightweight remote agent collector for multi-instance fleet monitoring
- G9: PWA installable with offline shell and push notification support
- G10: Curated safe-action controls replacing the read-only terminal

### Non-Goals
- N1: Replacing the OpenClaw CLI or gateway. TenacitOS-X is a UI layer, not a runtime.
- N2: Supporting non-OpenClaw agent frameworks. This is OpenClaw-native.
- N3: Building a SaaS/cloud-hosted version. Self-hosted only.
- N4: Full IDE/code editor. File browser stays lightweight.
- N5: Replacing openclaw.json as the source of truth. Dashboard reads and optionally writes back; the JSON file remains authoritative.

---

## 4. User Personas

### P1: Solo Operator
Runs 1-3 OpenClaw agents on a single VPS. Needs cost visibility, basic alerts, and the ability to check agent status from their phone. Least technical of the personas.

### P2: DevOps Engineer
Manages 5-20 agents across 2-5 VPS instances. Needs fleet-level observability, session debugging, Docker management, and multi-user auth so team members can share access.

### P3: Team Lead / Manager
Wants high-level cost reports, approval gates for sensitive agent actions, and audit trails. Interacts mostly through the AI chat and alert notifications rather than drilling into raw logs.

---

## 5. Feature Specifications

---

### F1: Real-Time WebSocket/SSE Streaming Layer

**Priority:** P0 (foundational -- other features depend on this)

**Description:**
Replace polling-based data fetching with a Server-Sent Events (SSE) layer for one-way streaming and WebSocket for bidirectional communication. SSE handles system metrics, activity feed, agent status, and notifications. WebSocket handles agent interaction (F2) and AI chat (F4).

**Implementation Approach:**
- Use Next.js Route Handlers with `ReadableStream` for SSE endpoints
- Add a lightweight event bus (in-process `EventEmitter` or Redis pub/sub for multi-instance) that filesystem watchers and SQLite polling feed into
- Filesystem watchers (via `chokidar`) on key paths: `openclaw.json`, workspace `MEMORY.md` files, activity logs
- SQLite change detection via periodic diff (better-sqlite3 doesn't support change notifications natively)
- Client-side: replace `useEffect` + `fetch` polling with `EventSource` hooks
- Graceful fallback to polling if SSE connection drops

**SSE Endpoints:**
| Endpoint | Payload | Interval |
|---|---|---|
| `/api/stream/system` | CPU, RAM, disk, network, PM2/Docker status | 2s |
| `/api/stream/agents` | Agent list with current status, active session | 5s |
| `/api/stream/activity` | New activity log entries (append-only) | Push on event |
| `/api/stream/notifications` | Notification center updates | Push on event |
| `/api/stream/costs` | Rolling cost counter for today | 30s |

**Acceptance Criteria:**
- AC1: System monitor page updates without manual refresh
- AC2: New activity feed entries appear within 2 seconds of the underlying event
- AC3: If SSE connection drops, client reconnects with exponential backoff and falls back to polling after 3 failures
- AC4: Server-side memory usage does not increase linearly with connected clients (fan-out pattern)

---

### F2: Agent Interaction and Lifecycle Control

**Priority:** P0

**Description:**
Add bidirectional agent control through the OpenClaw gateway API. This transforms the dashboard from observation-only to a true control plane.

**Capabilities:**
- **Agent lifecycle:** Start, stop, restart individual agents via gateway API
- **Session control:** Pause/resume an active session, cancel a running task
- **Message injection:** Send a message to an agent's active session (operator intervention)
- **Approval gates:** When an agent requests approval for a sensitive action (file delete, API call, purchase), show it in the dashboard with approve/deny buttons
- **Model hot-swap:** Change an agent's model at runtime without restarting

**UI Components:**
- Agent card gets action dropdown: Start | Stop | Restart | Configure
- Active session card gets: Pause | Resume | Cancel | Send Message
- New "Approvals" tab in the main navigation with pending approval count badge
- Approval detail view: shows the action requested, agent context, approve/deny with optional note

**Safety:**
- All control actions require confirmation dialog
- Destructive actions (stop agent, cancel session) require typing the agent name to confirm
- All control actions are logged to the audit trail (F3)
- Rate limiting on control endpoints: max 10 actions per minute per user

**Acceptance Criteria:**
- AC1: Operator can restart an agent from the dashboard and see it come back online in the agent list within 10 seconds
- AC2: Pending approvals show a badge count in the nav bar and are dismissable with approve/deny
- AC3: All control actions appear in the audit log with user identity and timestamp
- AC4: Sending a message to an agent's session is reflected in the session history

---

### F3: Multi-User Authentication with TOTP MFA

**Priority:** P0

**Description:**
Replace the single shared `ADMIN_PASSWORD` with a full multi-user auth system. Each user has their own account with optional TOTP MFA. All actions are attributed to a user for audit purposes.

**Auth Flow:**
1. First-run setup: create admin account (username + password)
2. Admin can invite users (generates a one-time registration link)
3. Registration: username, password (min 16 chars), optional TOTP setup
4. Login: username + password, then TOTP if enabled
5. Session: `httpOnly` secure cookie with configurable TTL (default 8 hours)
6. Remember-me option: extends session to 30 days

**Data Storage:**
- New SQLite database: `data/auth.db`
- Tables: `users`, `sessions`, `audit_log`, `invitations`
- Passwords hashed with Argon2id (preferred) or PBKDF2 fallback
- TOTP secrets encrypted at rest with `AUTH_SECRET`

**User Roles:**
| Role | Capabilities |
|---|---|
| `admin` | Full access. User management. System settings. |
| `operator` | Agent control, approvals, file/memory editing, terminal actions |
| `viewer` | Read-only access to all dashboards and logs |

**Audit Log:**
Every authenticated action writes to `audit_log`:
- `timestamp`, `user_id`, `action`, `target`, `details`, `ip_address`
- Viewable in a new "Audit Log" page (admin only)
- Retention: configurable, default 90 days

**Migration Path:**
- If `ADMIN_PASSWORD` env var is set and no `auth.db` exists, auto-create an admin user with that password on first boot (backward compatible)
- Deprecation warning in logs encouraging migration to the new system

**Acceptance Criteria:**
- AC1: New installation prompts for admin account creation
- AC2: TOTP setup shows QR code compatible with Google Authenticator, Authy, 1Password
- AC3: Failed login attempts are rate-limited: 5 failures triggers 15-minute lockout per IP (preserving upstream behavior)
- AC4: All API routes enforce role-based access
- AC5: Audit log captures every control action with user attribution

---

### F4: AI-Powered Conversational Ops Chat

**Priority:** P1

**Description:**
Add a chat panel that lets operators query the dashboard in natural language, routed through the local OpenClaw gateway. The chat has access to dashboard context (costs, agent status, session history, cron status) as tool calls.

**Architecture:**
- Chat panel slides in from the right side (drawer pattern)
- Messages sent to `/api/chat` which proxies to the OpenClaw gateway
- System prompt includes current dashboard state as context
- Gateway uses its configured model (respects the operator's model choice)

**Example Queries:**
- "What did my agents spend this week?"
- "Which cron jobs failed in the last 24 hours?"
- "Show me Studio's last 5 sessions"
- "Is anything using more than 80% CPU right now?"
- "Compare cost per agent for March"

**Tool Functions (exposed to the LLM):**
- `get_costs(agent_id?, period?)` - Cost data
- `get_agent_status(agent_id?)` - Current agent states
- `get_sessions(agent_id?, limit?, status?)` - Session history
- `get_cron_status()` - Cron job states and last run times
- `get_system_metrics()` - Current CPU/RAM/disk
- `get_activity(agent_id?, limit?)` - Recent activity entries
- `search_memory(query)` - Full-text search across memory files

**Safety:**
- Chat is read-only by default. No tool functions that modify state.
- Optional "operator mode" (requires `operator` role) unlocks: `restart_agent()`, `trigger_cron()`, `approve_action()`
- All chat interactions logged to audit trail
- Rate limited: 20 messages per minute per user

**Acceptance Criteria:**
- AC1: Chat panel opens without page navigation
- AC2: Natural language cost queries return accurate numbers matching the Cost Tracking page
- AC3: Chat respects user role (viewer cannot trigger operator-mode tools)
- AC4: Conversation history persists within a session but clears on logout

---

### F5: Docker Container Management

**Priority:** P1

**Description:**
Extend the System Monitor page with a Docker panel showing container status and basic lifecycle controls.

**Data Source:**
- Docker Engine API via Unix socket (`/var/run/docker.sock`)
- Falls back gracefully if Docker is not installed or socket is not accessible

**Views:**
- **Container list:** Name, image, status (running/stopped/exited), CPU%, memory, uptime, ports
- **Image list:** Repository, tag, size, created date
- **System:** Docker version, total containers, total images, disk usage

**Controls (requires `operator` role):**
- Start / Stop / Restart individual containers
- View container logs (last 100 lines, streaming)
- Prune stopped containers and dangling images (with confirmation)

**Acceptance Criteria:**
- AC1: Docker panel shows accurate container status matching `docker ps -a` output
- AC2: Container log viewer streams new lines in real-time via SSE
- AC3: If Docker is unavailable, the panel shows a clear "Docker not detected" message instead of errors
- AC4: All Docker control actions logged to audit trail

---

### F6: Configurable Alerting and Thresholds

**Priority:** P1

**Description:**
Add a rules engine for proactive alerting based on system metrics, costs, agent status, and cron health.

**Alert Rule Structure:**
```json
{
  "id": "cost-daily-limit",
  "name": "Daily cost exceeds $10",
  "condition": {
    "metric": "cost.daily.total",
    "operator": "gt",
    "value": 10.00
  },
  "sustained_checks": 1,
  "cooldown_minutes": 60,
  "channels": ["in_app", "webhook"],
  "severity": "critical",
  "enabled": true
}
```

**Built-in Alert Templates:**
- Daily cost exceeds threshold (per-agent and total)
- CPU sustained above X% for Y minutes
- RAM usage above X%
- Disk usage above X%
- Agent idle for more than X minutes
- Agent session failed / errored
- Cron job missed scheduled run
- Cron job execution failed
- Gateway offline / unreachable

**Notification Channels:**
- **In-app:** Populates the existing notification center with severity-coded alerts
- **Webhook:** POST to a configurable URL (supports Slack, Discord, generic)
- **Telegram:** Send to a Telegram chat via bot token (many OpenClaw users already have this)
- **Email:** SMTP-based (optional, requires configuration)

**UI:**
- New "Alerts" page with rule list, enable/disable toggles, edit forms
- Alert history view showing when each alert fired and auto-resolved
- Dashboard topbar shows a colored indicator when active critical alerts exist

**Data Storage:**
- Rules stored in `data/alert-rules.json`
- Alert history in `data/alert-history.json` (rotated, max 10,000 entries)

**Acceptance Criteria:**
- AC1: A cost alert fires within 60 seconds of the threshold being crossed
- AC2: Webhook notifications deliver within 5 seconds of alert firing
- AC3: Cooldown prevents duplicate alerts for the same condition
- AC4: Alert auto-resolves when the condition clears and logs the resolution

---

### F7: Session Replay and Agent Trace Inspection

**Priority:** P1

**Description:**
Add a session detail view that shows the complete execution trace of an agent session, including reasoning, tool calls, file operations, and token usage per step.

**Data Source:**
- OpenClaw session SQLite databases (already used for cost tracking)
- Session log files in workspace directories

**Session Detail View:**
- **Timeline:** Vertical timeline of every step in the session
- **Step card:** Each step shows:
  - Timestamp and duration
  - Step type: `reasoning`, `tool_call`, `tool_result`, `user_message`, `assistant_message`
  - Token count (input/output) for this step
  - For tool calls: tool name, arguments, result (collapsible)
  - For file operations: file path, diff view (before/after)
- **Summary bar:** Total tokens, total cost, duration, model used, tools invoked count
- **Search:** Full-text search within session content
- **Export:** Download session trace as JSON

**UI:**
- Accessible from the Sessions page by clicking any session row
- Breadcrumb: Sessions > Agent Name > Session ID
- Steps are lazy-loaded (paginated) for long sessions

**Acceptance Criteria:**
- AC1: Session detail view loads within 2 seconds for sessions with up to 100 steps
- AC2: Tool call arguments and results are syntax-highlighted (JSON/code)
- AC3: File diffs render as unified diff with line highlighting
- AC4: Session export produces valid JSON that can be re-imported for analysis

---

### F8: Multi-Instance Remote Agent Support

**Priority:** P2

**Description:**
Add a lightweight collector agent that runs on remote VPS instances and pushes metrics/status to a central TenacitOS-X instance.

**Architecture:**
- **Collector:** A single Node.js script (`tenacitos-collector`) that runs on each remote host
- **Transport:** HTTPS POST to the central dashboard's `/api/collector/ingest` endpoint
- **Auth:** Shared API key per collector (generated in the dashboard UI)
- **Payload:** System metrics, agent list, session summaries, cost snapshots, alert-worthy events
- **Frequency:** Configurable, default every 30 seconds

**Central Dashboard Changes:**
- New "Fleet" page showing all connected instances with status
- Instance detail drills into that host's agents, costs, system metrics
- Existing pages gain an "Instance" filter dropdown when multiple instances are connected
- Fleet-level cost aggregation (total spend across all instances)

**Collector Configuration:**
```env
TENACITOS_CENTRAL_URL=https://mission-control.yourdomain.com
TENACITOS_API_KEY=generated-in-dashboard
TENACITOS_INSTANCE_NAME=vps-eu-01
TENACITOS_PUSH_INTERVAL=30
OPENCLAW_DIR=/root/.openclaw
```

**Data Storage:**
- Central dashboard stores collector data in `data/fleet.db` (SQLite)
- Retention: configurable, default 30 days of metric history

**Acceptance Criteria:**
- AC1: Collector script is a single file runnable with `npx tenacitos-collector`
- AC2: Central dashboard shows instance as "online" within 60 seconds of collector starting
- AC3: If a collector stops reporting, instance shows "offline" after 2x the push interval
- AC4: Fleet page shows aggregate cost across all instances

---

### F9: Mobile PWA with Push Notifications

**Priority:** P2

**Description:**
Make TenacitOS-X installable as a Progressive Web App with offline shell caching and push notifications for alerts.

**PWA Features:**
- `manifest.json` with app name, icons, theme color, display: standalone
- Service worker for offline shell (app shell model -- cache HTML/CSS/JS, not data)
- Push notifications via Web Push API for alert delivery (F6)
- Responsive layouts for all pages (mobile-first breakpoints)
- Bottom navigation bar on mobile replacing the desktop dock

**Responsive Priorities:**
- Dashboard overview: stack cards vertically on mobile
- Agent list: card view instead of table on narrow screens
- Session list: horizontal scroll or card view
- 3D Office: disable on mobile (too heavy), show a flat agent grid instead
- AI Chat: full-screen drawer on mobile

**Push Notification Flow:**
1. User enables notifications in dashboard settings
2. Browser requests push permission
3. Dashboard stores push subscription in `auth.db`
4. When an alert fires (F6), the alert engine sends push to all subscribed users with appropriate role
5. Clicking the notification opens the relevant dashboard page

**Acceptance Criteria:**
- AC1: "Add to Home Screen" prompt appears on mobile Chrome and Safari
- AC2: App shell loads when offline (shows cached UI with "offline" indicator)
- AC3: Push notification arrives on mobile within 10 seconds of alert firing
- AC4: All pages are usable on a 375px-wide screen without horizontal scrolling

---

### F10: Hardened Action Controls

**Priority:** P2

**Description:**
Replace the read-only terminal with a curated set of safe operational actions presented as a button-based control panel.

**Action Categories:**

**Gateway:**
- Check gateway status
- Restart gateway service
- View gateway logs (last 100 lines)

**Data:**
- Collect usage data (run `collect-usage.ts`)
- Run memory compaction
- Export cost report (CSV download)

**System:**
- View system info (OS, Node version, OpenClaw version, uptime)
- Check disk usage breakdown
- View PM2 process list

**Maintenance:**
- Clear Next.js build cache (`.next`)
- Rotate log files
- Backup data directory

**UI:**
- Grid of action cards grouped by category
- Each card: icon, name, description, "Run" button
- Running state: spinner, live output stream
- Completed state: success/failure indicator, output log (collapsible)
- All actions logged to audit trail

**Safety:**
- Each action maps to a single predefined command (no user input concatenation)
- Actions are role-gated: `viewer` can only run read-only actions, `operator` can run all
- Destructive actions (restart, clear cache) require confirmation dialog
- Command execution is sandboxed: no shell expansion, no pipes, no chaining

**Acceptance Criteria:**
- AC1: No freeform text input for commands anywhere in the UI
- AC2: Gateway restart action restarts the service and reports success/failure within 15 seconds
- AC3: All action outputs are streamed to the UI in real-time via SSE
- AC4: A viewer-role user cannot see or trigger operator-level actions

---

## 6. Technical Constraints

- **Runtime:** Node.js 22 (matching upstream)
- **Framework:** Next.js 16 App Router (preserving upstream architecture)
- **Database:** SQLite only (via better-sqlite3). No PostgreSQL or external DB requirement.
- **Auth:** All auth data local. No OAuth providers required (optional future enhancement).
- **Deployment:** Single `npm run build && npm start`. No Docker required to run the dashboard itself (Docker management feature reads from socket on host).
- **Backward Compatibility:** Existing `ADMIN_PASSWORD` + `AUTH_SECRET` env vars must continue working for single-user mode.
- **Bundle Size:** 3D Office already uses React Three Fiber. New features should not add more than 500KB to the initial JS bundle (lazy-load heavy features).
- **Browser Support:** Chrome 120+, Firefox 120+, Safari 17+, Edge 120+.

---

## 7. Release Phases

### Phase 1: Foundation (Weeks 1-3)
- F1: SSE streaming layer
- F3: Multi-user auth with TOTP
- F10: Hardened action controls

### Phase 2: Control Plane (Weeks 4-6)
- F2: Agent interaction and lifecycle control
- F6: Alerting and thresholds
- F5: Docker management

### Phase 3: Intelligence (Weeks 7-9)
- F4: AI chat
- F7: Session replay and trace inspection

### Phase 4: Scale and Mobile (Weeks 10-12)
- F8: Multi-instance fleet support
- F9: PWA and push notifications

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| Time to detect runaway cost | < 60 seconds (vs. "next time you check the API dashboard") |
| Dashboard page load (cold) | < 2 seconds on localhost |
| SSE data latency | < 2 seconds from event to UI update |
| Auth setup time (new install) | < 2 minutes |
| Mobile Lighthouse PWA score | > 90 |
| Collector setup on remote VPS | < 5 minutes |
| Session trace load time (100 steps) | < 2 seconds |

---

## 9. Open Questions

- Q1: Should the AI chat use the OpenClaw gateway directly, or should we embed a lightweight LLM call (e.g., direct Anthropic API) to avoid dependency on gateway being healthy?
- Q2: For multi-instance support, should the central dashboard also accept metrics via OpenClaw's own messaging channels (Telegram, Discord) as a fallback transport?
- Q3: Should we support OpenClaw's new ClawHub plugin format for distributing the dashboard as an installable skill?
- Q4: What is the right default cost alert threshold? Community reports suggest $10/day is a reasonable starting point.

---

## 10. References

- Upstream: https://github.com/carlosazaustre/tenacitOS
- OpenClaw docs: https://docs.openclaw.ai
- Competing dashboards reviewed: tugcantopaloglu/openclaw-dashboard, mudrii/openclaw-dashboard, abhi1693/openclaw-mission-control
- OpenClaw v2026.3.22 release notes (gateway API changes, ClawHub, security hardening)
