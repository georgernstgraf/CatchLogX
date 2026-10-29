# AGENTS.md

## Agent Sessions (no sandbox)
Agents (opencode) are started **on every machine that clones this repo** — a clone can sit
on live infrastructure, and there is **no sandbox**: the agent's shell shares the host with
whatever runs there. **At session start, identify the host before touching anything**
(`hostname`, `whoami`, `systemctl --user list-units | grep -i clx`):
- On the dev VPS (`claw.graf.priv.at`, served as `catchlogx.graf.priv.at`, user `catchlogx`)
  the shell shares the machine with `catchlogx.service` (app, port 40873) and
  `actions.runner.catchlogx-vps.service` (the `vps` deploy runner). Never stop/restart units
  "just to try", never kill raw PIDs (see `PITFALLS.md`), RAM is ~3.8 GB.
- On the BOKU production machine only the `boku` runner's jobs run — even more caution.
- General rule: determine host first, then act; treat every listening port and every user
  unit as live infrastructure, not as a playground.

## Stack
Next.js 16.0 (App Router), TypeScript (strict), Prisma + PostgreSQL, Tailwind CSS v4, NextAuth.js v4.

## Infrastructure
PostgreSQL 16 runs via Docker Compose (`docker-compose.yml`). Uploaded files and
templates are stored **in the database** (`FileBlob`, `bytea`) — no object store
is involved (see `docs/ai/DECISIONS.md`, 2026-10-17).
- Start: `docker compose up -d db db-shadow-init` (or `docker compose up -d` for full stack)

On the dev instance `catchlogx.graf.priv.at` the app runs as a systemd **user** service under the
`catchlogx` user and serves an **immutable release**: `catchlogx.service` runs
`node ~/current/server.js`, where `~/current` → `~/releases/<sha>/` (Next.js `output: "standalone"`).

Deploys are **push-driven**: the `deploy` job in `.github/workflows/deploy-dev.yml` (gated by
the `CI` workflow via `workflow_run`) builds on the self-hosted runner
`actions.runner.catchlogx-vps.service` (label `vps`, running under the same `catchlogx` user
manager), publishes the release with `scripts/publish-release.sh`, applies `prisma migrate deploy`,
restarts `catchlogx.service` and health-checks `127.0.0.1:40873`. So
`systemctl --user restart catchlogx.service` is a plain ~2 s restart with **no build**, and a
rollback is "point `~/current` at the previous release and restart". Units live in
`~/.config/systemd/user/`. Never kill raw PIDs (see `PITFALLS.md`).

## Commands
```
npm run dev           # start dev server (needs PostgreSQL running)
npm run build         # production build
npm run lint          # ESLint directly (eslint .) — Next 16 removed `next lint`
npm run typecheck     # tsc --noEmit
npm test              # Vitest, single run (vitest run) — pure service-logic tests, no DB needed
npm run create-user   # create admin user (hardcoded admin/admin, dev only)
npm run prisma:generate  # regenerate Prisma client (required after schema changes; also runs via postinstall)
npm run prisma:migrate -- --name <name>  # schema change (dev): create + apply a migration
npm run prisma:deploy   # apply pending migrations (dev instance, production)
```

## Tests (Vitest, #112)

- Config: `vitest.config.ts` (mirrors the `@/*` alias from `tsconfig.json`), `environment: "node"`
- Test files live next to the source: `services/*.test.ts`, `lib/*.test.ts`, `middleware.test.ts`
- Rule: no real DB or SMTP. Replace I/O modules with `vi.mock` (`@/lib/prisma`,
  `@/lib/mailer`, `bcrypt`; `fetch` via `vi.stubGlobal`) so `npm test` stays fast and runs in the hook/CI.
- Templates: `services/adminService.test.ts` (mocked prisma/mailer, permission matrix, Excel built
  in memory via `XLSX.utils`), `lib/session.test.ts` (fake timers + real `NextRequest`), `services/queryService.test.ts` (pure).
- To make helpers testable, lift/export them from their module with `// Exported for unit tests (#112).`
  (e.g. `normalize`, `buildSchema`, `parseDate`, `buildRejectEmailHtml`). No behaviour changes.
- Not covered: API route handlers, React components (no jsdom), `lib/auth.ts` (NextAuth, unused).

## Test Requirement (strict TDD, #112)

Every implementation that touches code — **feature and bug fix alike** — must come with
tests in the same unit of work (same commit / same push). Docs- and infra-only changes
(README, workflows, deploy scripts, `docs/`) are exempt.

Strict red → green:

1. **Bug fix:** write the **regression test first** and watch it fail against the old code
   (red), then apply the fix (green). The test pins the exact reported scenario.
2. **Feature:** write the test at the **public seam** of the changed module (service
   function, lib helper, exported route-level helper) first, then implement just enough
   to pass it. One slice at a time — no bulk tests written after the fact.
3. **Seams:** test behaviour through public interfaces, not internals. Do not test
   private methods or mock internal collaborators of the unit under test.
4. **Where:** test file lives next to the source (`services/foo.test.ts`, `lib/foo.test.ts`),
   `environment: "node"`, no real DB/SMTP (mock `@/lib/prisma`, `@/lib/mailer`, `bcrypt`;
   stub `fetch` via `vi.stubGlobal`).
5. **Un-exported logic to test?** Export the helper with the marker
   `// Exported for unit tests (#112).` — no behaviour change.
6. **Not testable without jsdom?** (React components, route handlers) — say so explicitly
   in the commit/PR message and name what a test would need; never silently skip.
7. **Mock-shape fidelity:** if an existing test asserts Prisma call shapes, adjust the
   assertion when changing a query — never delete the test.
8. **Gate:** the pre-push hook and CI enforce green tests. A code change without its
   tests is an incomplete change: it should fail review, not just the build.

## Git Workflow (Trunk-Based)

- **Trunk = `dev` branch.** All work happens directly on `dev` — **no feature branches**.
- `master` is production (protected: PR + 1 approval); it receives merges from `dev` only.
- **Pull first:** At the start of every work session run `git pull --ff-only origin dev` before touching code.
- Commit early and often; every commit must reference a GitHub issue (see Git / Issues below).
- **Pre-push hook (lint + typecheck + test gate):** Pushes to `dev` are aborted when `npm run lint`, `npm run typecheck` (`tsc --noEmit`), or `npm test` (`npx vitest run`) fails. Output is shown directly (not suppressed) so a failure is visible without re-running the command.
  - Hook lives at `.githooks/pre-push`; activate once per clone with:
    `git config core.hooksPath .githooks`
  - Check activation with `npm run check:hooks` (warns only — never fails).
  - Agents: warn about an inactive hook at session start (see the
    `issue-workflow` skill) — warn only, let the user activate it.
- **CI is source of truth:** `.github/workflows/ci.yml` runs `npm run lint` + `npm run typecheck` + `npm test` on push/PR to `dev`/`master`.
  The dev instance is deployed by `.github/workflows/deploy-dev.yml`, which fires via `workflow_run`
  once `ci.yml` concluded successfully on `dev` (`needs:` does not cross workflow files, so the
  gate is `workflow_run` plus an `if` on the job — and it requires the file on `master` to exist at all).
  The local hook is fast feedback only — hooks are bypassable (`--no-verify`) and opt-in per clone.

## Prisma

**Client is in a non-standard location.** The generator outputs to `../app/generated/prisma` (not `node_modules/.prisma/client`). Import it as:
```ts
import { PrismaClient } from "../app/generated/prisma";
```
After any schema change, run `npm run prisma:generate` before `next dev` or `next build`.

**Database is PostgreSQL** (migrated from SQLite). Connection via `DATABASE_URL` env var.
Query logging is disabled (empty `log: []` in `lib/prisma.ts`).

### Migrations: migration-only workflow (#129)

**The migration history in `prisma/migrations/` is the single source of truth for the schema.**

- **Schema change (dev):** `npx prisma migrate dev --name <name>` — creates a migration *and* applies it.
  Requires a shadow database: set `SHADOW_DATABASE_URL` (dev: `clx_shadow`, created by the
  `db-shadow-init` service in `docker-compose.yml`).
- **Deploy (dev instance, production, CI):** `npx prisma migrate deploy` — applies pending migrations only.
- **`npx prisma db push` is banned** outside throwaway sandboxes. It bypasses the history, writes no
  migration, and silently drops/recreates tables on renames (data loss).
- **CI enforces this:** the `migration-drift` job in `.github/workflows/ci.yml` applies the history to an
  empty database and fails when it no longer matches `schema.prisma`.
- History state: a single baseline `20261017190000_init` was generated from `schema.prisma` on 2026-10-17
  (#129) after the history had drifted (the `UserRoles` enum had never been migrated). The dev database was
  rebuilt from it; the BOKU production database is rebuilt from it at the maintenance appointment (#122).

## Auth

The app uses a **custom cookie-based session system**, not NextAuth sessions:

- Cookie: `session-token` (httpOnly, 30-day expiry)
- Server: `lib/session.ts` reads cookie, validates against `Session` table
- API: custom routes at `/api/auth/sign-in`, `/api/auth/session`, `/api/auth/logout`
- Client: `components/AuthProvider.tsx` provides `useAuth()` hook
- Route guard: `components/ProtectedRoute.tsx` wraps protected pages
- API guard: `lib/auth-middleware.ts` exports `requireAuth()` and `withAuth()`
- Admin guard: `lib/admin-middleware.ts` exports `requireAdminAuth()` and `withAdminAuth()`
- Edge guard: `middleware.ts` performs a lightweight cookie check on `/api/admin/*`

NextAuth is configured in `lib/auth.ts` and `app/api/auth/[...nextauth]/route.ts` but is **not used** by the UI.

## Service Layer

API routes delegate to service modules in `services/`. Do NOT put business logic directly in route handlers:
- `services/adminService.ts` — user CRUD, upload approval, file management
- `services/templateFileService.ts` — template file list, upload, visibility, soft delete, download
- `services/authService.ts` — sign-in, session validation
- `services/passwordService.ts` — forgot-password, reset-password, change-initial-password
- `services/queryService.ts` — SQL query validation and execution
- `services/uploadService.ts` — Excel upload, validation, DB insertion

## File Storage

Uploaded files and template files are stored as **PostgreSQL blobs** (`FileBlob`, `bytea`), written together with their metadata row in a single (nested) create so file bytes and upload record cannot drift. Helpers: `lib/fileBlobs.ts`. Downloads stream the bytes back out of the database.

## Conventions

- UI text is English; code comments and variable names are English
- New files: `.tsx`; legacy files like LoginForm/ForgotPasswordForm are `.jsx`
- Brand color `#357174` is hardcoded via Tailwind classes across components
- `@/*` path alias resolves to project root
- Files using hooks or browser APIs need `"use client"` directive
- `no-explicit-any` ESLint rule is disabled (`@typescript-eslint/no-explicit-any: off`)

## Key Files

| Area | Path |
|------|------|
| DB schema | `prisma/schema.prisma` |
| Prisma client (singleton) | `lib/prisma.ts` |
| Auth context (client) | `components/AuthProvider.tsx` |
| Route guard (client) | `components/ProtectedRoute.tsx` |
| Session validation (server) | `lib/session.ts` |
| API auth middleware (server) | `lib/auth-middleware.ts` |
| Admin auth middleware (server) | `lib/admin-middleware.ts` |
| File blob helpers | `lib/fileBlobs.ts` |
| Email sender (nodemailer) | `lib/mailer.ts` |
| Admin panel page | `app/admin/page.tsx` |
| User creation (dev seed) | `scripts/create-user.ts` |
| Supervision log (hours) | `docs/Betreuung.md` |
| Meeting minutes | `docs/meetings/` (one file per meeting: `YYYY-MM-DD-topic.md`, German) |

## Git / Issues

When committing, consult the `issue-workflow` skill. Every commit must reference a GitHub issue number (e.g. `#42`). Do not create commits without an existing issue.

## Skills

Skills live in `.opencode/skills/` and are **committed to the repo** — every clone discovers them without extra setup.

- `engineering/` — vendored snapshot of [mattpocock/skills](https://github.com/mattpocock/skills) (`skills/engineering/`). 18 skills (code-review, implement, tdd, diagnosing-bugs, …). Not auto-updated.
- `issue-workflow/` — project-owned; backs the commit rule below.
- `knowledge-persistence/` — project-owned; maintains the `docs/ai/*` knowledge files.

**Update engineering skills** (run when you want upstream changes; review the diff before committing):
```
bash scripts/update-engineering-skills.sh
git diff .opencode/skills/engineering
```

Notes:
- The `searxng` skill is intentionally **not** in the repo — it is coupled to a private SearXNG instance and an MCP server registered in the user's global opencode config.
- `domain-modeling` and `grill-with-docs` exist both in the engineering set and (for some contributors) in global skills; the vendored (in-repo) versions are canonical for this project.

## Knowledge Bootstrap
Before starting any task, read the following files in order:
1. `docs/ai/HANDOFF.md` ← **read first, act on it**
2. `docs/ai/CONVENTIONS.md`
3. `docs/ai/DECISIONS.md`
4. `docs/ai/ARCHITECTURE.md`
5. `docs/ai/PITFALLS.md`
6. `docs/ai/STATE.md`
7. `docs/ai/DOMAIN.md` (if task involves business logic)

If `HANDOFF.md` contains open tasks, complete them before starting
any new work unless the user explicitly says otherwise.
