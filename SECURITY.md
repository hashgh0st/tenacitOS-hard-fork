# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :x: (upstream)     |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by:

1. **Email**: security@openclaw.ai (or create a private security advisory on GitHub)
2. **Do NOT** open a public issue
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to resolve the issue.

## Security Architecture

### Authentication

- **Multi-user accounts** with per-user sessions (replaces single shared password)
- **Password hashing**: Argon2id (memoryCost=65536, timeCost=3, parallelism=4) with PBKDF2 fallback
- **Two-factor authentication**: TOTP (RFC 6238) compatible with Google Authenticator, Authy, 1Password
- **TOTP secrets**: Encrypted at rest with AES-256-GCM using `AUTH_SECRET` as key derivation input
- **Session tokens**: 32-byte random, stored as SHA-256 hash in SQLite
- **Session cookies**: `httpOnly`, `sameSite=lax`, `secure` in production
- **Login rate limiting**: 5 failed attempts triggers 15-minute lockout per IP

### Authorization (RBAC)

Three roles with hierarchical permissions:

| Role | Access |
|------|--------|
| **admin** | Full access to the dashboard, audit log, user management, and all actions. |
| **operator** | Operational dashboards plus non-admin actions. |
| **viewer** | Read-only access to dashboards and logs. |

All API routes enforce role-based access via a `withAuth()` wrapper in Node.js route handlers. The Edge Runtime middleware only checks cookie existence (no SQLite access in Edge).

### Audit Trail

- Every authenticated action writes to `audit_log` table in `auth.db`
- Fields: timestamp, user_id, username (denormalized), action, target, details (JSON), ip_address, severity
- Append-only: no API to delete audit entries
- Retention: configurable, default 90 days

### Command Safety

- **No shell expansion anywhere.** All child processes use `execFile` with explicit argument arrays
- Safe action controls use predefined command definitions in code -- no user input concatenation
- Action commands are looked up by ID from a static registry; arbitrary commands cannot be submitted
- All action executions are logged to the audit trail

### SQL Injection Prevention

- All SQLite queries use parameterized statements via better-sqlite3's built-in binding
- No string interpolation in SQL queries

### Content Security

- Markdown and text rendering stay within the shipped dashboard UI; there is no Phase 3 chat surface in the current release.

### Network Security

- Gateway API runs on loopback by default (`GATEWAY_URL=http://localhost:3001`)
- Docker socket access is opt-in and configurable via `DOCKER_SOCKET` env var

### Rate Limiting

| Endpoint | Limit | Scope |
|----------|-------|-------|
| Login | 5 attempts / 15 min | Per IP |

Additional per-feature rate limits for later roadmap phases are not in scope for the current release.

## Security Best Practices

### For Deployment

1. **Generate strong secrets**
   ```bash
   openssl rand -base64 32   # AUTH_SECRET
   ```

2. **File permissions**
   ```bash
   chmod 600 .env.local
   chmod 700 data/
   ```

3. **HTTPS required in production** -- use Caddy (auto-TLS) or another reverse proxy

4. **Keep gateway on loopback** (127.0.0.1) unless you specifically need remote access

5. **Docker socket access** -- add the dashboard user to the `docker` group or configure `DOCKER_SOCKET`

### For Development

1. **Never commit**: `.env.local`, `data/*.json`, `data/*.db`, real credentials
2. **Use branding config**: Import from `src/config/branding.ts`, not hardcoded values
3. **Run `npm audit`** regularly and address findings
4. **No dynamic code evaluation** with user input
5. **Always use `execFile`** with explicit argument arrays for child processes

## Security Checklist

Before deploying to production:

- [ ] Generated fresh `AUTH_SECRET` with `openssl rand -base64 32`
- [ ] Created admin account via setup wizard (not using legacy `ADMIN_PASSWORD`)
- [ ] Enabled TOTP for all admin accounts
- [ ] Set file permissions on `.env.local` (600) and `data/` (700)
- [ ] Configured HTTPS via reverse proxy
- [ ] Verified Docker socket permissions (if using Docker features)
- [ ] Reviewed `npm audit` output
- [ ] Configured firewall rules
- [ ] Tested rate limiting is active
- [ ] Verified audit log is recording actions

## Responsible Disclosure

We follow coordinated vulnerability disclosure:

1. Reporter notifies us privately
2. We confirm and develop a fix
3. We release a patched version
4. Disclosure is made public after patch is available

Thank you for helping keep TenacitOS-X secure.
