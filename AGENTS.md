# Repository Guidelines

## Project Structure & Module Organization
`src/app` contains the Next.js App Router UI and API routes, including dashboard pages under `src/app/(dashboard)` and server handlers in `src/app/api/**/route.ts`. Shared UI lives in `src/components`, with 3D office code under `src/components/Office3D` and `src/components/office`. Put reusable logic in `src/lib`, React hooks in `src/hooks`, and static config in `src/config`. Tests are split into `tests/unit`, `tests/integration`, `tests/e2e`, plus shared setup in `tests/setup.ts` and fixtures in `tests/mocks`. Runtime JSON and example seed files live in `data/`; static assets and the PWA files live in `public/`.

## Build, Test, and Development Commands
Use `npm run dev` for local development on port 3000. Build production assets with `npm run build`, then serve them with `npm run start`. Run `npm run lint` before opening a PR. Use `npm test` for the Vitest suite, `npm run test:coverage` for coverage output, and `npm run test:e2e` for Playwright browser tests. `bash scripts/pre-commit-check.sh` is the project-specific safety check for secrets and staged data files.

## Coding Style & Naming Conventions
This repo uses strict TypeScript, Next.js 16, and ESLint via `eslint.config.mjs`. Follow the existing style: 2-space indentation, semicolons, and double quotes in TS/TSX files. Use the `@/*` path alias for internal imports when it improves readability. Name React components in `PascalCase`, hooks in `camelCase` with a `use` prefix, and keep route files named `route.ts`, `page.tsx`, or `layout.tsx` to match App Router conventions.

## Testing Guidelines
Place unit and integration tests in `tests/unit/**/*.test.ts` and `tests/integration/**/*.test.ts`; Vitest is already configured for those patterns. Add coverage for new logic in `src/lib`, `src/hooks`, `src/config`, and `src/app/api`, which are the main tracked coverage areas. Keep Playwright coverage in `tests/e2e`, and write flows that work against the local server started by the Playwright config.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`; keep that format and add a short scope or phase note when useful. PRs should explain the behavior change, call out affected routes or data files, link the issue when one exists, and include screenshots for visible UI updates. Mention the commands you ran to validate the change.

## Security & Configuration Tips
Start from `.env.example` and keep secrets in `.env.local`. Do not commit `.env.local`, live `data/*.json`, or database files from `data/`; only commit `*.example.json` templates. If you touch auth, alerts, or fleet code, run `bash scripts/pre-commit-check.sh` before committing.
