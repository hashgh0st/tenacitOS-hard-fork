# TenacitOS-X Development Guide

## Project Overview

TenacitOS-X is a hard fork of carlosazaustre/tenacitOS. It transforms a read-only OpenClaw monitoring dashboard into a full agent operations platform. See `PRD.md` for requirements and `TDD.md` for technical design.

## Architecture

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 (utility classes only, no custom CSS files)
- **Database:** SQLite via better-sqlite3 (separate .db files per concern: auth.db, fleet.db)
- **Streaming:** SSE for one-way, HTTP streaming for chat
- **Auth:** Argon2id + TOTP, thin Edge middleware + Node.js `withAuth()` wrapper

## Conventions

### File Naming
- Components: PascalCase (`AgentCard.tsx`)
- Utilities/libs: kebab-case (`usage-queries.ts`)
- Match upstream patterns when extending existing code

### TypeScript
- Strict mode is enabled — do not weaken it
- Use `@/*` path aliases (maps to `./src/*`)
- Parameterized queries only for SQLite — never interpolate user input into SQL

### Styling
- Tailwind v4 utility classes only
- No new CSS files — everything goes through Tailwind
- Responsive breakpoints: `sm` (<640px), `md` (640-1024px), `lg` (>1024px)

### Security
- **Always use `execFile`, never `exec`** — no shell expansion, no user input interpolation
- All child processes must use the `execFile` pattern with explicit args arrays
- SQLite: parameterized statements only via better-sqlite3 binding
- TOTP secrets encrypted at rest with AES-256-GCM
- Auth cookies: httpOnly, sameSite=lax, secure in production

### Components
- React Three Fiber imports ONLY in `src/components/Office3D/` — nowhere else
- Shared components go in `src/components/shared/`
- Feature-specific components go in `src/components/{FeatureName}/`

### Database
- Each concern gets its own .db file (auth.db, fleet.db)
- Enable WAL mode on all databases
- All .db files live in `data/` and are gitignored
- Example JSON files have `.example.json` counterparts committed to git

### API Routes
- All protected routes use the `withAuth()` wrapper (not middleware for SQLite access)
- Middleware only checks cookie existence (Edge Runtime limitation)
- SSE endpoints use ReadableStream + event bus pattern
- Rate limiting enforced per-endpoint

## Testing

- **Unit/Integration:** Vitest (`npm test`, `npm run test:watch`)
- **E2E:** Playwright (`npm run test:e2e`)
- **Coverage:** `npm run test:coverage`
- Unit tests are mandatory for: auth (password, TOTP, sessions), alert engine, rate limiters
- E2E tests for: auth flows, critical user journeys

## Build Order (Phase 1)

1. Event Bus (`src/lib/events/bus.ts`) — foundation for all streaming
2. SSE layer (pollers, watchers, route handlers, useSSE hook)
3. Auth system (db, password, sessions, TOTP, middleware, withAuth)
4. Safe action controls (definitions, execution API, UI)
