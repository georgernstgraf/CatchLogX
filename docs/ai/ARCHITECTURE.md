# Architecture

Living structural map of the system as of 2026-10-17.
Overwritten when structural changes occur during a session.

## Overview
CatchLogX is a Next.js 16.0 web application for BOKU Wien's hydrobiology department.
It manages fish catch data via Excel upload, SQL querying, and visualization.
Stack: Next.js App Router, TypeScript, Prisma ORM + PostgreSQL, Tailwind CSS v4, NextAuth.js v4.
Infrastructure: PostgreSQL 16 via Docker Compose. File bytes (uploads + templates) live in the database as `FileBlob` (`bytea`), so no object store is needed (#131).

## Repositories
- **`georgernstgraf/CatchLogX`** (this repo, **public**) — application code only.
- **`georgernstgraf/CatchLogX-Data`** (**private**) — the Excel deliveries from BOKU hydrobiology (provenance, structure, and naming conventions in its own README and `docs/ai/`); trunk `main`, no Git LFS, append-only. The data itself must never land in this public repo (#125).

## Deployment Topology
- **Local development** — `docker compose up -d` (PostgreSQL 16 + app container), app on port 3001.
- **Production (BOKU)** — desktop-class machine on Martin Seebacher's desk (institute IT, OE-level) inside the BOKUnet, productive since June 2026, so far accredited only informally by email. Maintenance access is deliberately restricted to university-sanctioned paths — see `DECISIONS.md` ("No self-managed maintenance tunnels into the BOKUnet") and #115. No standing tunnel, VPN bridge, or reverse tunnel may be attached to this machine.
- **Dev instance `catchlogx.graf.priv.at`** — CNAME to `claw.graf.priv.at` (Georg's own VPS). Since 2026-10-17 the students' development copy runs there (#126), entirely under the dedicated system user `catchlogx` with **no root at runtime**:
  - rootless Docker (socket `/run/user/1003/docker.sock`) runs only PostgreSQL 16 from `~/dev-stack/docker-compose.yml`, bound to `127.0.0.1:5432`; volume `clx_pgdata`;
  - file bytes are stored in this PostgreSQL (table `FileBlob`); the former MinIO binary/`minio.service` unit and the `mc` client are obsolete since #131 (upload/download need no second service);
  - the app is a production build (`npm run build`) started by user unit `catchlogx.service` on `127.0.0.1:40873`; repo clone at `~/repos/georgernstgraf/CatchLogX` (branch `dev`). Every (re)start of `catchlogx.service` first triggers the oneshot unit `catchlogx-update.service` (`Wants`/`After`), which runs `~/.config/catchlogx/deploy.sh`: `git pull --ff-only origin dev` → `npm ci` (only when `package-lock.json` changed) → `npx prisma migrate deploy` → `npm test` (failure warns only, never blocks the deploy) → `npm run build` (only when HEAD moved). Pull/ci/migrate/build failures fail the update unit while the running server keeps serving the previous build. So a plain `systemctl --user restart catchlogx.service` is the full deploy+restart; `systemctl --user start catchlogx-update.service` deploys without touching the running server. The superseded unit `clx-app.service` is disabled (its file remains in `~/.config/systemd/user/`);
  - nginx on 443 terminates TLS (Let's Encrypt, certbot) and reverse-proxies to `127.0.0.1:40873`;
  - secrets live only in `~/dev-stack/.env` and the app's `.env` (mode 600, gitignored) — never in this repo or in SVN docs;
  - the nginx vhost, the systemd user units and the dev-stack compose file are mirrored in the claw deployment tree (SVN), not in this repo (the 2026-10-17 `catchlogx`/`catchlogx-update` units and `~/.config/catchlogx/deploy.sh` are not yet mirrored there).
  A second self-hosted GitHub Actions runner is planned on this machine (#123).

### Deploy paths (workflows)
| Workflow | Trigger | Runs on | What it does |
|---|---|---|---|
| `test.yml` | push/PR to `dev`, `master` | GitHub-hosted | lint + typecheck + test (the correctness gate) |
| `production-deploy.yml` | push to `master` | `[self-hosted, linux, x64]` | `cd /opt/CatchLogX`, `git reset --hard origin/master`, `docker compose down && up -d --build` |
| `manual.yml` | push to `master` (despite the name) | GitHub-hosted | SSH deploy to `catchlogx.test.a19.at` using the `TEST_SERVER_*` secrets |

The `master` deploy therefore **depends on a repo-level self-hosted runner** (`catchlogx-server`, Linux, online, last successful run 2026-07-13) that appears to be the leftover runner from the previous diploma team on the BOKU production machine — to be confirmed on site (#122). Removing it without a replacement breaks the production deploy; and because it runs on BOKU-owned hardware in the BOKUnet, it is the subject of the pending inquiry in #115. Note that `runs-on` decides job placement by label, not by branch — see `PITFALLS.md` before adding a second self-hosted runner.

## Directory Map
```
app/                    Next.js App Router pages + API routes
  layout.tsx            Root layout (Geist fonts, ThemeProvider, AuthProvider wrapper)
  page.tsx              Dashboard (ProtectedRoute → DashboardComponent)
  globals.css           Tailwind import + dark mode CSS variables
  login/page.jsx        Login page
  upload/page.tsx       File upload page
  admin/page.tsx        Admin panel (user/upload management)
  about/page.tsx        About page with contact info
  my-uploads/page.tsx   User's uploaded files list
  reset-password/page.tsx   Password reset page
  first-login/page.tsx      First-login password change page
  api/auth/             Sign-in, logout, session, change-initial-password
  api/admin/            Admin CRUD (users, uploads, files)
  api/query/            SQL query execution + save
  api/upload/           Excel upload (new, my, template-file)
  api/forgot-password/  Forgot password request
  api/reset-password/   Password reset
components/             React components (all client-side)
  ThemeProvider.tsx      Dark mode context provider
  DarkModeToggle.tsx     Dark/light mode button
  AuthProvider.tsx       AuthContext provider + useAuth() hook
  LoginForm.jsx             Login form
  ForgotPasswordForm.jsx    Forgot password form
  LogoutButton.tsx          Logout button
  ProtectedRoute.tsx        Route guard, redirects to /login
  Sidebar.tsx               Left sidebar (nav + user info + logout)
  DashboardComponent.tsx    Dashboard shell
  UploadPageComponent.tsx   File upload page with validation
  SqlQueryComponent.tsx     SQL query UI with results table + map
  MapComponent.tsx          Leaflet map with marker support
  AdminPageComponent.tsx    Admin user/upload management
  AdminTemplateFilesManager.tsx Template file management UI
  MyUploadsPageComponent.tsx User's upload list
lib/                    Server-side utilities
  prisma.ts             Prisma singleton (imports from app/generated/prisma)
  session.ts            Custom session management (cookie → Session table → user)
  auth.ts               NextAuth config (credentials provider, JWT sessions — unused by UI)
  auth-middleware.ts    requireAuth() + withAuth() wrappers for API routes
  admin-middleware.ts   requireAdminAuth() + withAdminAuth() for admin routes
  fileBlobs.ts          FileBlob helpers (bytes in PostgreSQL)
  mailer.ts             Nodemailer SMTP transport (password reset emails)
  template-files.ts      Template file tracking helpers
services/               Business logic layer (API routes delegate here)
  authService.ts        Sign-in, session validation
  passwordService.ts    Forgot-password, reset, change-initial-password
  adminService.ts       User CRUD, upload approval/rejection, file downloads
  templateFileService.ts  Template file list, upload, visibility, soft delete, download
  queryService.ts       SQL query validation, execution, save/delete
  uploadService.ts      Excel upload, validation, DB insertion
prisma/
  schema.prisma         Data model + generator (output: app/generated/prisma)
  migrations/           Migration history — single baseline `*_init` (schema source of truth)
scripts/                Dev utilities
  create-user.ts        User creation (admin/admin)
  insert-fish.ts        Seed fish species
  insert-river-sites.ts Seed river sites
  insert-samplings.ts   Seed samplings
  insert-fish-catches.ts Seed fish catches
  wipe-and-seed.ts      Wipe and re-seed all data
  wipe-fish.ts          Wipe fish species only
middleware.ts           Edge middleware (cookie check on /api/admin/* paths)
docker-compose.yml      PostgreSQL 16 + app stack
```

## Data Model
```
User ──< Session             (custom auth)
User ──< Uploads             (excel upload tracking)
User ──< UserQueries          (saved SQL queries)
UploadStates: UPLOADED | ACCEPTED | REJECTED | DB_ERROR | SAVED_IN_DB
PasswordResetStates: REQUESTED | EXPIRED | DONE

TemplateFiles ── FileBlob       (template bytes + metadata, #131)
Uploads ── FileBlob             (uploaded Excel bytes, #131)

RiverSite ──< Sampling ──< FishCatch ── FishSpecies
FishCatch: added pitDec, pitHex, recapture fields for PIT tag tracking
```

## Auth Flow
```
LoginForm (client)
  → POST /api/auth/sign-in { username, password }
  → services/authService.ts
  → bcrypt.compare() against User.hashedPassword
  → creates Session row (32-byte hex token, 30-day expiry)
  → sets httpOnly cookie "session-token"
  → returns { user }
  → AuthProvider.setUser(user)

Page load (client)
  → AuthProvider calls GET /api/auth/session
  → reads cookie, looks up Session (incl. user)
  → returns { authenticated: true, user } or { authenticated: false }

Protected route (client)
  → ProtectedRoute checks AuthProvider.isAuthenticated
  → router.replace(/login) if unauthenticated

API route (server)
  → requireAuth() calls getSessionUser() from lib/session.ts
  → returns 401 if no valid session-token cookie

Admin API route (server + edge)
  → middleware.ts checks session-token cookie existence on /api/admin/*
  → lib/admin-middleware.ts checks role === "admin" from session
```

## Startup Order
1. `docker compose up -d db` (PostgreSQL 16)
2. Set `DATABASE_URL` and `SHADOW_DATABASE_URL` in `.env`
3. `npx prisma generate`
4. `npx prisma migrate deploy`
5. `npm run create-user` (optional: + seed scripts)
6. `npm run dev`
