# AGENTS.md

## Stack
Next.js 16.0 (App Router), TypeScript (strict), Prisma + PostgreSQL, Tailwind CSS v4, NextAuth.js v4.

## Infrastructure
PostgreSQL 16 and MinIO run via Docker Compose (`docker-compose.yml`).
- Start: `docker compose up -d db minio minio-init` (or `docker compose up -d` for full stack)

## Commands
```
npm run dev           # start dev server (needs PostgreSQL + MinIO running)
npm run build         # production build
npm run lint          # ESLint via next lint
npm run create-user   # create admin user (hardcoded admin/admin, dev only)
npx prisma generate   # regenerate Prisma client (required after schema changes)
npx prisma db push    # push schema to DB (dev — migrations are not kept current)
```

No test runner or typecheck script is configured. TypeScript errors surface during `next build` or `next lint`.

## Prisma

**Client is in a non-standard location.** The generator outputs to `../app/generated/prisma` (not `node_modules/.prisma/client`). Import it as:
```ts
import { PrismaClient } from "../app/generated/prisma";
```
After any schema change, run `npx prisma generate` before `next dev` or `next build`.

**Database is PostgreSQL** (migrated from SQLite). Connection via `DATABASE_URL` env var.
Query logging is disabled (empty `log: []` in `lib/prisma.ts`).

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
- `services/authService.ts` — sign-in, session validation
- `services/passwordService.ts` — forgot-password, reset-password, change-initial-password
- `services/queryService.ts` — SQL query validation and execution
- `services/uploadService.ts` — Excel upload, validation, DB insertion

## File Storage

Uploaded files are stored in **MinIO** (S3-compatible), managed via `lib/minio.ts`. The bucket is `catchlogx-files` with `uploads/` and `dummy_files/` prefixes. MinIO must be running for upload/download to work.

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
| MinIO client | `lib/minio.ts` |
| Email sender (nodemailer) | `lib/mailer.ts` |
| Admin panel page | `app/admin/page.tsx` |
| User creation (dev seed) | `scripts/create-user.ts` |

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
