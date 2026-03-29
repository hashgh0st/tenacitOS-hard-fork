# TenacitOS-X Roadmap

> See [PRD.md](./PRD.md) for full feature specifications and [TDD.md](./TDD.md) for technical design.

## Phase 1: Foundation (Weeks 1-3)

| Feature | Description | Status |
|---------|-------------|--------|
| **F1: SSE Streaming** | Replace polling with Server-Sent Events. Event bus, filesystem watchers, system metrics poller, 5 SSE endpoints, `useSSE` client hook. | Planned |
| **F3: Multi-User Auth + TOTP** | Per-user accounts with Argon2id hashing, TOTP MFA, RBAC (admin/operator/viewer), audit logging, invitation system. | Planned |
| **F10: Safe Action Controls** | Replace read-only terminal with curated action grid. Predefined commands, `execFile` execution, streaming output, role gating. | Planned |

## Phase 2: Control Plane (Weeks 4-6)

| Feature | Description | Status |
|---------|-------------|--------|
| **F5: Docker Management** | Container list, start/stop/restart, streaming logs, image list, disk usage. Raw HTTP over Unix socket (no SDK). Graceful degradation. | Planned |
| **F2: Agent Lifecycle Control** | Start/stop/restart agents via gateway API. Message injection. Approval gates with auto-deny timeout. Model hot-swap. | Planned |
| **F6: Alerting Engine** | Rules engine with 10-second eval loop. Metric resolvers for CPU, RAM, cost, agent idle, cron, gateway. Multi-channel delivery (in-app, webhook, Telegram, email). | Planned |

## Phase 3: Intelligence (Weeks 7-9)

| Feature | Description | Status |
|---------|-------------|--------|
| **F7: Session Replay** | Full execution trace viewer. TraceStep timeline with tool calls, reasoning, file diffs. Paginated loading, search, JSON export. | Planned |
| **F4: AI Ops Chat** | Slide-out chat panel proxied through OpenClaw gateway. 7 read-only tools + 3 operator tools. HTTP streaming responses. | Planned |

## Phase 4: Scale + Mobile (Weeks 10-12)

| Feature | Description | Status |
|---------|-------------|--------|
| **F8: Fleet Monitoring** | Standalone collector script on remote VPS instances. Central fleet dashboard with aggregate cost tracking. Offline detection. | Planned |
| **F9: PWA + Push** | Installable PWA with offline shell. Push notifications for alerts. Responsive layouts for all pages. Bottom nav on mobile. | Planned |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| 3D | React Three Fiber + Drei |
| Charts | Recharts |
| Database | SQLite (better-sqlite3) |
| Auth | Argon2id + TOTP (otpauth) |
| Streaming | Server-Sent Events |
| Push | Web Push API (VAPID) |
| Testing | Vitest + Playwright |
| Runtime | Node.js 22 |
