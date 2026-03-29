# TenacitOS-X -- OpenClaw Mission Control

A real-time operations platform for [OpenClaw](https://openclaw.ai) AI agent fleets. Monitor, control, and manage your agents from a single dashboard. Built with Next.js 16, React 19, and Tailwind CSS v4.

> Hard fork of [carlosazaustre/tenacitOS](https://github.com/carlosazaustre/tenacitOS). TenacitOS-X transforms the original read-only monitoring dashboard into a full agent operations platform with real-time streaming, agent lifecycle control, multi-user auth, fleet management, and more.

---

## What Changed from Upstream

The original TenacitOS is a solid monitoring dashboard. TenacitOS-X keeps everything that works and adds the operational muscle that production deployments need:

| Upstream TenacitOS | TenacitOS-X |
|---|---|
| Polling-based data refresh | Real-time SSE streaming (sub-2s latency) |
| Read-only terminal | Curated safe-action control panel |
| Single shared password | Multi-user auth with TOTP MFA and RBAC |
| Observation only | Full agent lifecycle control (start/stop/restart/message) |
| No alerting | Configurable threshold alerts with webhook, Telegram, and email delivery |
| Single host only | Multi-instance fleet monitoring with remote collectors |
| Desktop layout | Mobile PWA with push notifications |
| No session depth | Full session replay with tool call traces and file diffs |
| No Docker visibility | Docker container management panel |
| No AI assistant | Natural language ops chat powered by your OpenClaw gateway |

---

## Features

### Core (from upstream)
- **System Monitor** -- Real-time VPS metrics (CPU, RAM, Disk, Network) + PM2/Docker status
- **Agent Dashboard** -- All agents, sessions, token usage, model, and activity status
- **Cost Tracking** -- Real cost analytics from OpenClaw sessions (SQLite)
- **Cron Manager** -- Visual cron manager with weekly timeline, run history, and manual triggers
- **Activity Feed** -- Real-time log of agent actions with heatmap and charts
- **Memory Browser** -- Explore, search, and edit agent memory files
- **File Browser** -- Navigate workspace files with preview and in-browser editing
- **Global Search** -- Full-text search across memory and workspace files
- **Office 3D** -- Interactive 3D office with one desk per agent (React Three Fiber)

### New in TenacitOS-X

**Real-Time Streaming**
Server-Sent Events for system metrics, agent status, activity feed, notifications, and cost counters. Data arrives in the browser within 2 seconds of the underlying event. No more stale dashboards.

**Agent Control Plane**
Start, stop, and restart agents. Send messages to active sessions. Approve or deny pending agent actions. Hot-swap models at runtime. All actions require confirmation and log to the audit trail.

**Multi-User Auth + TOTP MFA**
Per-user accounts with role-based access (admin, operator, viewer). Optional TOTP two-factor authentication compatible with Google Authenticator, Authy, and 1Password. Argon2id password hashing. Full audit log of every action.

**AI Ops Chat**
Slide-out chat panel that lets you query your dashboard in natural language. Powered by your local OpenClaw gateway. Ask questions like "what did my agents spend this week?" or "which cron jobs failed today?" and get accurate answers pulled from live dashboard data.

**Docker Management**
Container list with status, CPU, memory, and port mapping. Start, stop, restart containers. View streaming container logs. Prune stopped containers and dangling images. Gracefully hidden if Docker is not installed.

**Configurable Alerts**
Set thresholds on cost, CPU, RAM, disk, agent idle time, cron failures, and gateway health. Alerts fire after sustained threshold breaches with configurable cooldowns. Deliver to in-app notifications, webhooks (Slack/Discord), Telegram, or email.

**Session Replay**
Click into any session to see the full execution trace: every reasoning step, tool call, tool result, and file operation with unified diffs. Search within sessions. Export traces as JSON.

**Fleet Monitoring**
Run a lightweight collector script on remote VPS instances to push metrics to your central TenacitOS-X dashboard. See all instances on a fleet overview page with aggregate cost tracking. Offline detection when collectors stop reporting.

**Mobile PWA**
Installable as a Progressive Web App. Offline app shell. Push notifications for alerts. Responsive layouts for all pages. Bottom navigation on mobile. 3D office replaced with a flat agent grid on small screens.

**Hardened Action Controls**
The read-only terminal is replaced with a curated grid of safe operational actions: check gateway status, restart gateway, collect usage data, run compaction, view system info, export cost reports, and more. No freeform command input. All actions are predefined in code with role gating.

---

## Requirements

- **Node.js** 22+ (tested with v22)
- **[OpenClaw](https://openclaw.ai)** installed and running on the same host
- **PM2** or **systemd** (recommended for production)
- **Caddy** or another reverse proxy (for HTTPS in production)
- **Docker** (optional, for Docker management features)

---

## Quick Start

### 1. Clone into your OpenClaw workspace

```bash
cd /root/.openclaw/workspace
git clone https://github.com/hashgh0st/tenacitOS-hard-fork.git mission-control
cd mission-control
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your settings. At minimum, set `AUTH_SECRET`:

```env
# Generate a secret
openssl rand -base64 32
```

### 3. Initialize data files

```bash
cp data/cron-jobs.example.json data/cron-jobs.json
cp data/activities.example.json data/activities.json
cp data/notifications.example.json data/notifications.json
cp data/configured-skills.example.json data/configured-skills.json
cp data/tasks.example.json data/tasks.json
cp data/alert-rules.example.json data/alert-rules.json
```

### 4. Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

On first boot, you'll be redirected to the setup wizard to create your admin account.

> **Migrating from upstream?** If you have an existing `ADMIN_PASSWORD` in your `.env.local`, TenacitOS-X will automatically create an admin account with that password on first boot. You can then set up TOTP and invite additional users from the dashboard.

---

## Authentication

TenacitOS-X uses a multi-user auth system with three roles:

| Role | Access |
|---|---|
| **Admin** | Everything. User management, audit logs, fleet API keys, system settings. |
| **Operator** | Agent control, approvals, Docker management, alert configuration, all actions. |
| **Viewer** | Read-only access to all dashboards, logs, and session traces. |

### Setting Up TOTP (Two-Factor Authentication)

1. Log in to the dashboard
2. Go to your profile settings
3. Click "Enable Two-Factor Authentication"
4. Scan the QR code with your authenticator app
5. Enter the 6-digit code to confirm
6. Save your backup codes somewhere safe

### Inviting Users

Admins can invite new users from the Users page. Each invitation generates a one-time registration link with a pre-assigned role.

---

## Fleet Monitoring (Multi-Instance)

To monitor agents running on remote VPS instances:

### On the central dashboard

1. Go to Fleet > API Keys
2. Generate a new collector API key
3. Copy the key

### On each remote VPS

```bash
# Install the collector
npx tenacitos-collector

# Or set environment variables and run
TENACITOS_CENTRAL_URL=https://mission-control.yourdomain.com \
TENACITOS_API_KEY=your-generated-key \
TENACITOS_INSTANCE_NAME=vps-eu-01 \
TENACITOS_PUSH_INTERVAL=30 \
OPENCLAW_DIR=/root/.openclaw \
npx tenacitos-collector
```

The collector pushes system metrics, agent status, and cost snapshots to your central dashboard every 30 seconds. If a collector stops reporting, the instance shows as offline after 60 seconds.

---

## Alerts

TenacitOS-X ships with built-in alert templates:

- Daily cost exceeds threshold (per-agent and total)
- CPU sustained above X% for Y minutes
- RAM / Disk usage above threshold
- Agent idle for more than X minutes
- Agent session failed or errored
- Cron job missed or failed
- Gateway offline or unreachable

### Notification Channels

- **In-app** -- Notification center with severity-coded alerts
- **Webhook** -- POST to any URL (Slack, Discord, custom)
- **Telegram** -- Send to a Telegram chat via bot token
- **Email** -- SMTP-based delivery

Configure alert rules and channels from the Alerts page in the dashboard.

---

## Production Deployment

### PM2

```bash
npm run build
pm2 start npm --name "mission-control" -- start
pm2 save
pm2 startup
```

### systemd

Create `/etc/systemd/system/mission-control.service`:

```ini
[Unit]
Description=TenacitOS-X -- OpenClaw Mission Control
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/.openclaw/workspace/mission-control
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable mission-control
sudo systemctl start mission-control
```

### Reverse Proxy (Caddy)

```
mission-control.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### PWA Push Notifications

To enable push notifications, generate VAPID keys and add them to `.env.local`:

```bash
npx web-push generate-vapid-keys
```

```env
VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_EMAIL=mailto:admin@yourdomain.com
```

---

## Project Structure

```
mission-control/
├── src/
│   ├── app/
│   │   ├── (dashboard)/          # Dashboard pages (protected)
│   │   │   ├── agents/           # Agent dashboard + controls
│   │   │   ├── approvals/        # Approval gate UI
│   │   │   ├── alerts/           # Alert rules and history
│   │   │   ├── audit/            # Audit log viewer (admin)
│   │   │   ├── docker/           # Docker management
│   │   │   ├── fleet/            # Multi-instance fleet view
│   │   │   ├── sessions/         # Session list + replay
│   │   │   ├── actions/          # Safe action controls
│   │   │   └── users/            # User management (admin)
│   │   ├── api/                  # API routes
│   │   │   ├── auth/             # Login, register, TOTP
│   │   │   ├── stream/           # SSE endpoints
│   │   │   ├── agents/           # Agent CRUD + control
│   │   │   ├── chat/             # AI ops chat
│   │   │   ├── docker/           # Docker API proxy
│   │   │   ├── alerts/           # Alert CRUD
│   │   │   ├── collector/        # Fleet ingest
│   │   │   └── actions/          # Safe action execution
│   │   ├── login/                # Login page
│   │   ├── register/             # Registration page
│   │   ├── setup/                # First-run setup wizard
│   │   └── office/               # 3D office
│   ├── components/
│   │   ├── TenacitOS/            # OS-style UI shell
│   │   ├── Office3D/             # React Three Fiber 3D office
│   │   ├── Chat/                 # AI chat drawer
│   │   ├── Approvals/            # Approval cards
│   │   ├── Alerts/               # Alert rule editor
│   │   ├── Docker/               # Container cards
│   │   ├── Fleet/                # Instance cards
│   │   ├── SessionReplay/        # Trace timeline
│   │   └── Actions/              # Action cards
│   ├── config/
│   │   ├── branding.ts           # Branding (reads from env)
│   │   └── actions.ts            # Safe action definitions
│   └── lib/
│       ├── auth/                 # Auth, RBAC, audit, TOTP
│       ├── events/               # Event bus, watchers, pollers
│       ├── docker/               # Docker Engine API client
│       ├── alerts/               # Alert engine + channels
│       ├── fleet/                # Fleet DB + ingest
│       ├── chat/                 # Gateway proxy + tools
│       └── sessions/             # Trace parser
├── collector/                    # Standalone fleet collector script
├── data/                         # JSON data + SQLite DBs (gitignored)
├── docs/                         # Extended documentation
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service Worker
│   └── models/                   # GLB avatar models
└── scripts/                      # Setup and data collection
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| 3D | React Three Fiber + Drei |
| Charts | Recharts |
| Icons | Lucide React |
| Database | SQLite (better-sqlite3) |
| Auth | Argon2id + TOTP (otpauth) |
| Streaming | Server-Sent Events + WebSocket |
| Push | Web Push API (VAPID) |
| Runtime | Node.js 22 |

---

## Security

- Multi-user auth with Argon2id password hashing and optional TOTP MFA
- Role-based access control (admin / operator / viewer) on all routes and API endpoints
- Login rate limiting: 5 failed attempts triggers 15-minute lockout per IP
- Auth cookies are `httpOnly`, `sameSite: lax`, and `secure` in production
- TOTP secrets encrypted at rest with AES-256-GCM
- All control actions logged to an append-only audit trail
- Safe action controls use `execFile` (no shell expansion, no user input interpolation)
- Terminal command allowlist replaced with predefined action definitions in code
- Docker socket access is opt-in and configurable
- Fleet collector API keys are separate from user sessions
- CSP headers restrict inline scripts and external resources

Generate fresh secrets:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 18   # ADMIN_PASSWORD (legacy mode)
```

See [SECURITY.md](SECURITY.md) for the full security policy and vulnerability reporting instructions.

---

## Troubleshooting

**"Gateway not reachable" / agent data missing**
```bash
openclaw status
openclaw gateway start
```

**"Database not found" (cost tracking)**
```bash
npx tsx scripts/collect-usage.ts
```

**Docker panel shows "Docker not detected"**
```bash
# Verify Docker is running
docker ps

# Verify socket is accessible
ls -la /var/run/docker.sock

# Set custom socket path if needed
echo 'DOCKER_SOCKET=/path/to/docker.sock' >> .env.local
```

**TOTP code rejected**
- Verify your device clock is synced (TOTP is time-sensitive)
- Use a backup code if your authenticator is unavailable
- An admin can reset your MFA from the Users page

**Build errors after pulling updates**
```bash
rm -rf .next node_modules
npm install
npm run build
```

---

## Roadmap

- [x] Fork and restructure from upstream
- [ ] **Phase 1:** SSE streaming layer, multi-user auth + TOTP, safe action controls
- [ ] **Phase 2:** Agent lifecycle control, alerting engine, Docker management
- [ ] **Phase 3:** AI ops chat, session replay with trace inspection
- [ ] **Phase 4:** Fleet monitoring with remote collectors, PWA + push notifications

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Keep personal data out of commits (use `.env.local` and `data/`, both gitignored)
4. Write clear commit messages
5. Open a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

---

## License

MIT -- see [LICENSE](LICENSE)

---

## Credits

- Original [TenacitOS](https://github.com/carlosazaustre/tenacitOS) by [Carlos Azaustre](https://github.com/carlosazaustre)
- [OpenClaw](https://openclaw.ai) -- the AI agent runtime this dashboard is built for

---

## Links

- [OpenClaw](https://openclaw.ai)
- [OpenClaw Docs](https://docs.openclaw.ai)
- [Discord Community](https://discord.com/invite/clawd)
- [GitHub Issues](https://github.com/hashgh0st/tenacitOS-hard-fork/issues)
