# TenacitOS-X -- OpenClaw Mission Control

A real-time operations platform for [OpenClaw](https://openclaw.ai) AI agent fleets. Monitor, control, and manage your agents from a single dashboard. Built with Next.js 16, React 19, and Tailwind CSS v4.

> Hard fork of [carlosazaustre/tenacitOS](https://github.com/carlosazaustre/tenacitOS). TenacitOS-X transforms the original read-only monitoring dashboard into a full agent operations platform with real-time streaming, multi-user auth, agent lifecycle control, Docker management, configurable alerts, and more.

---

## What Changed from Upstream

The original TenacitOS is a solid monitoring dashboard. TenacitOS-X keeps everything that works and adds the operational muscle that production deployments need:

| Upstream TenacitOS | TenacitOS-X |
|---|---|
| Polling-based data refresh | Real-time SSE streaming (sub-2s latency) |
| Read-only terminal | Curated safe-action control panel |
| Single shared password | Multi-user auth with TOTP MFA and RBAC |
| Observation only | Full agent lifecycle control (start/stop/restart/message) |
| No Docker visibility | Docker container management (remote host support) |
| No alerting | Configurable threshold alerts with webhook, Telegram, and email delivery |

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
Server-Sent Events for system metrics, agent status, activity feed, notifications, and cost counters. The dashboard now updates continuously instead of relying on manual refreshes.

**Multi-User Auth + TOTP MFA**
Per-user accounts with role-based access (admin, operator, viewer). Optional TOTP two-factor authentication compatible with common authenticator apps. Argon2id password hashing and an audit trail are built in.

**Hardened Action Controls**
The read-only terminal is replaced with a curated grid of safe operational actions such as gateway status checks, restarts, usage collection, system info, disk usage, PM2 inspection, cache clearing, and data backup. No freeform command input. All actions are predefined in code with role gating.

**Agent Control Plane**
Start, stop, and restart agents through the OpenClaw gateway. Send messages to active sessions. Hot-swap models at runtime. Approve or deny pending agent actions from an approval queue with auto-deny countdown. All control actions require confirmation and log to the audit trail. Rate limited to 10 actions per minute per user.

**Docker Management**
Connect to a remote Docker host via `DOCKER_HOST` (TCP or Unix socket). View containers with status, images, and system info. Start, stop, and restart containers. Stream container logs in real-time. Prune stopped containers and dangling images. Gracefully hidden when Docker is not configured.

**Configurable Alerts**
Set thresholds on CPU, RAM, disk, daily cost, and gateway health. Alerts fire after sustained threshold breaches with configurable cooldowns. Deliver to in-app notifications, webhooks (Slack/Discord), Telegram, or email. Auto-resolve when conditions clear. Active critical alerts show a red indicator in the top bar.

---

## Requirements

- **Node.js** 22+ (tested with v22)
- **[OpenClaw](https://openclaw.ai)** installed and running on the same host
- **PM2** or **systemd** (recommended for production)
- **Caddy** or another reverse proxy (for HTTPS in production)
- **Docker** (optional, remote host via `DOCKER_HOST` env var for container management)

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
cp data/alert-channels.example.json data/alert-channels.json
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
| **Admin** | Full access, including user management, audit review, and all actions. |
| **Operator** | Operational dashboards plus non-admin actions. |
| **Viewer** | Read-only access to dashboards and logs. |

### Setting Up TOTP (Two-Factor Authentication)

1. Log in to the dashboard
2. Go to your profile settings
3. Click "Enable Two-Factor Authentication"
4. Scan the QR code with your authenticator app
5. Enter the 6-digit code to confirm

### Inviting Users

Admins can invite new users from the Users page. Each invitation generates a one-time registration link with a pre-assigned role.

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

## Project Structure

```
mission-control/
├── src/
│   ├── app/
│   │   ├── (dashboard)/          # Dashboard pages (protected)
│   │   │   ├── actions/          # Safe action controls
│   │   │   ├── activity/         # Activity feed + charts
│   │   │   ├── agents/           # Agent dashboard + lifecycle control
│   │   │   ├── alerts/           # Alert rules and history
│   │   │   ├── approvals/        # Approval gate queue
│   │   │   ├── audit/            # Audit log viewer (admin)
│   │   │   ├── costs/            # Usage and spend pages
│   │   │   ├── docker/           # Docker container management
│   │   │   ├── files/            # File browser
│   │   │   ├── memory/           # Memory browser
│   │   │   ├── sessions/         # Session list and detail views
│   │   │   └── users/            # User management (admin)
│   │   ├── api/                  # API routes
│   │   │   ├── auth/             # Login, register, TOTP
│   │   │   ├── agents/           # Agent control + model swap
│   │   │   ├── alerts/           # Alert CRUD + history
│   │   │   ├── approvals/        # Approval management
│   │   │   ├── docker/           # Docker API proxy
│   │   │   ├── stream/           # SSE endpoints
│   │   │   └── actions/          # Safe action execution
│   │   ├── login/                # Login page
│   │   ├── register/             # Registration page
│   │   ├── setup/                # First-run setup wizard
│   │   └── office/               # 3D office
│   ├── components/
│   │   ├── Actions/              # Action cards and output
│   │   ├── Agents/               # Agent action dropdown, modals
│   │   ├── Alerts/               # Alert rule cards, editor, history
│   │   ├── Approvals/            # Approval cards
│   │   ├── Docker/               # Container cards, log viewer
│   │   ├── TenacitOS/            # OS-style UI shell
│   │   ├── Office3D/             # React Three Fiber 3D office
│   │   ├── charts/               # Dashboard charts
│   │   ├── office/               # 2D/alt office views
│   │   └── shared/               # Shared client providers + dialogs
│   ├── config/
│   │   ├── branding.ts           # Branding (reads from env)
│   │   └── actions.ts            # Safe action definitions
│   └── lib/
│       ├── auth/                 # Auth, RBAC, audit, TOTP
│       ├── alerts/               # Alert engine, resolvers, channels
│       ├── docker/               # Docker Engine API client
│       ├── gateway/              # OpenClaw gateway client
│       └── events/               # Event bus, watchers, pollers
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
| Streaming | Server-Sent Events |
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
- All commands restricted to predefined action definitions in code
- Agent control actions rate-limited (10/min per user) with sliding window
- Docker socket access is opt-in via `DOCKER_HOST` env var
- Alert webhook/Telegram/email delivery is fire-and-forget with error isolation

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

**Docker panel shows "Docker not configured"**
```bash
# Set DOCKER_HOST to your remote Docker daemon
echo 'DOCKER_HOST=tcp://192.168.1.100:2375' >> .env.local

# Or for a local socket
echo 'DOCKER_HOST=unix:///var/run/docker.sock' >> .env.local
```

**Docker panel shows "Docker unreachable"**
```bash
# Verify the Docker daemon is running on the remote host
docker -H tcp://192.168.1.100:2375 ps

# Check firewall rules allow port 2375
```

**TOTP code rejected**
- Verify your device clock is synced (TOTP is time-sensitive)
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
- [x] **Phase 1:** SSE streaming layer, multi-user auth + TOTP, safe action controls
- [x] **Phase 2:** Agent lifecycle control, alerting engine, Docker management
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
