---
type: Conventions
title: Conventions
description: Coding-Muster, Namensregeln und Stilvereinbarungen.
tags: [catchlogx, conventions]
generated: { by: opencode/knowledge-persistence, at: 2026-11-14T20:13:37Z }
status: stable
---

# Conventions

Coding patterns, naming rules, and style agreements for this project.
Follow these without question. Do not deviate unless explicitly told.

## Language
- UI text: English
- Code comments and variable names: English

## File Types
- New components: `.tsx` (TypeScript + JSX)
- Legacy files: some `.jsx` files exist (LoginForm, ForgotPasswordForm)
- Migrate `.jsx` to `.tsx` when touching those files

## Architecture Pattern
- API routes are thin — delegate to `services/*.ts` for all business logic
- `lib/` contains shared utilities (prisma, session, fileBlobs, mailer, middleware helpers)
- `components/` are all client-side React components

## Auth Pattern
- Wrap protected pages in `<ProtectedRoute>`
- Use `useAuth()` hook from `@/components/AuthProvider` for client-side user state
- Use `withAuth()` or `requireAuth()` from `@/lib/auth-middleware` for API route protection
- Use `withAdminAuth()` or `requireAdminAuth()` from `@/lib/admin-middleware` for admin-only routes
- `middleware.ts` provides an additional cookie-check layer at the edge for `/api/admin/*`

## Styling
- Tailwind CSS v4 utility classes
- Brand color `#357174` (teal/green) — hardcoded in components, not a CSS variable
- Dark mode via `ThemeProvider` + Tailwind `dark:` classes
- `globals.css` contains `@import "tailwindcss";` and dark mode CSS variables

## Imports
- `@/*` alias resolves to project root (configured in tsconfig.json)
- Prisma client: import from `"../app/generated/prisma"` (relative path, NOT `@prisma/client`)

## Client/Server Boundaries
- Any file using React hooks, browser APIs, or event handlers needs `"use client"` directive
- `lib/` and `services/` files are server-side only
- `middleware.ts` runs in Edge Runtime — do NOT import Prisma there

## Database
- Prisma singleton pattern in `lib/prisma.ts` (globalThis caching)
- PostgreSQL 16 via Docker (`docker compose up -d db`)
- Schema changes: `npm run prisma:migrate -- --name <name>` (creates + applies a migration; needs `SHADOW_DATABASE_URL`); deploy with `npm run prisma:deploy`. **Never `prisma db push`** (#129)
- Run `npm run prisma:generate` after any schema change, before `next dev` or `next build` (also runs automatically via the `postinstall` script, #151)

## Scripts
- `scripts/` is split by **risk class**, not by host (#198):
  - `demo/` — seed and wipe scripts. Guarded by `lib/seedGuard.ts`: they refuse on any database that already holds catches; `wipe-*` additionally needs `ALLOW_DESTRUCTIVE_SEED=<hostname>/<current_database()>`.
  - `data/` — data maintenance that needs no database (e.g. the species-list generator, `--write`/`--check`).
  - `prod/` — one-off runbooks for the production machine.
  - `ops/` — harmless operational helpers (create-user, readonly-role, release, hooks, icons).
- A new script that writes base data belongs in `demo/` and imports the guard; the test in `lib/seedGuard.test.ts` fails otherwise.

## Local Entry Point
- New database: `docker compose up -d db db-shadow-init`, then `npm run db:init` (migrate deploy + demo seed), then `npm run dev`.
- The `app` service in `docker-compose.yml` is **not** the entry point and no longer seeds anything.
- `npm run db:init` is one-shot per database: the seed guard refuses as soon as a catch exists. For a fresh demo dataset wipe first (`scripts/demo/wipe-and-seed.ts`).

## Environment Variables
Required: `DATABASE_URL` (PostgreSQL connection string).
Mailer vars: `NODEMAILER_HOST` (required), `NODEMAILER_PORT` (default 587), `NODEMAILER_SECURE`,
`NODEMAILER_FROM` (sender address; falls back to `NODEMAILER_USER`), `NODEMAILER_USER` +
`NODEMAILER_PASSWORD` (optional, but only **together** — both unset = auth-less relay, as on
production via the loopback postfix, #160).
