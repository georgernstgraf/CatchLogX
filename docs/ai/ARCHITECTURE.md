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
- **Production (BOKU)** — desktop-class machine on Martin Seebacher's desk (institute IT, OE-level) inside the BOKUnet, productive since June 2026, so far accredited only informally by email. Maintenance access is deliberately restricted to university-sanctioned paths — see `DECISIONS.md` ("No self-managed maintenance tunnels into the BOKUnet") and #115. No standing tunnel, VPN bridge, or reverse tunnel may be attached to this machine. The machine still runs the **db-push era** (MinIO + `prisma db push`, schema with `DummyFiles`) from the last `master` push (2026-09-19, `dc2f1e4`): the app container applies `db push` on every start, so it must never be restarted against a migration-tracked database (see `PITFALLS.md`). The one-time, data-preserving upgrade to the migration baseline runs through the machine's own self-hosted runner — audit/backup (#138) → adoption script (#139) → rehearsal (#140) → cutover (#141) → immutable release + systemd user unit (#143) → gated deploy (#144).
- **Dev instance `catchlogx.graf.priv.at`** — CNAME to `claw.graf.priv.at` (Georg's own VPS). Since 2026-10-17 the students' development copy runs there (#126), entirely under the dedicated system user `catchlogx` with **no root at runtime**:
  - rootless Docker (socket `/run/user/1003/docker.sock`) runs only PostgreSQL 16 from `~/dev-stack/docker-compose.yml`, bound to `127.0.0.1:5432`; volume `clx_pgdata`;
  - file bytes are stored in this PostgreSQL (table `FileBlob`); the former MinIO binary/`minio.service` unit and the `mc` client are obsolete since #131 (upload/download need no second service);
  - the app serves an **immutable release**: user unit `catchlogx.service` runs `node ~/current/server.js` (`~/current` → `~/releases/<sha>/`, Next.js `output: "standalone"`), on `127.0.0.1:40873`; repo clone at `~/repos/georgernstgraf/CatchLogX` (branch `dev`). Deploys are push-driven (see the deploy-paths table below): the `deploy` job builds in the self-hosted runner, `scripts/publish-release.sh` publishes `~/releases/<sha>/` and atomically swaps `~/current`, then `prisma migrate deploy` → `systemctl --user restart catchlogx.service` → health check. A plain restart is therefore ~2 s with no build; rollback = repoint `~/current` and restart. The superseded `clx-app.service` and `catchlogx-update.service` (and `~/.config/catchlogx/deploy.sh`) are retired — `clx-app.service`'s file remains in `~/.config/systemd/user/`;
  - nginx on 443 terminates TLS (Let's Encrypt, certbot) and reverse-proxies to `127.0.0.1:40873`;
  - secrets live only in `~/dev-stack/.env` and the app's `.env` (mode 600, gitignored) — never in this repo or in SVN docs; the deploy job reads the app `.env` from that host path (the runner's checkout has no `.env`);
  - the nginx vhost, the systemd user units and the dev-stack compose file are mirrored in the claw deployment tree (SVN), not in this repo (the 2026-10-17 `catchlogx` unit and the new `actions.runner.catchlogx-vps.service` are not yet mirrored there; the retired `catchlogx-update` unit and `~/.config/catchlogx/deploy.sh` are gone).
  A self-hosted GitHub Actions runner now runs on this machine as user unit `actions.runner.catchlogx-vps.service` (label `vps`, repo runner 22), so deploy jobs can `systemctl --user`-restart the app directly (#123/#135).

### Deploy paths (workflows)
| Workflow | Trigger | Runs on | What it does |
|---|---|---|---|
| `test.yml` | push/PR to `dev`, `master` (+ manual dispatch) | GitHub-hosted; `deploy` job on `[self-hosted, vps]` | lint + typecheck + test (the correctness gate) + `migration-drift`; on push to `dev` (or manual dispatch on `dev`) the `deploy` job builds a standalone release, publishes `~/releases/<sha>`, runs `prisma migrate deploy`, restarts `catchlogx.service` and health-checks it |
| `production-deploy.yml` | **manual dispatch only** (temporarily, #137) | `[self-hosted, boku]` | `cd /opt/CatchLogX`, `git reset --hard origin/master`, `docker compose down && up -d --build`. Do **not** dispatch before the cutover (#141): the current compose runs `migrate deploy` against the db-push database and would leave production down |
| `production-maintenance.yml` | **manual dispatch only** (#138) | `[self-hosted, boku]` | `audit` job: verified `pg_dump` + MinIO export in a timestamped backup set on the machine, schema-drift report, row counts, `_prisma_migrations` state. Read-only; dumps never leave the machine (public repo) — only the structural reports are artifacts |

Two repo-level self-hosted runners exist, each pinned with a custom label: `catchlogx-vps` (label `vps`, this machine, #123/#135 — builds `dev`) and `catchlogx-server` (label `boku`, the leftover runner from the previous diploma team on the BOKU production machine, #122 — builds `master`). Because every self-hosted runner automatically carries `self-hosted`/`Linux`/`X64`, a job naming only those labels is eligible on **both**; that is why every machine-specific job names its custom label. Branch separation comes from combining the branch trigger/`if` guard with the label — GitHub has **no** branch-based runner routing, and runner *groups* are unavailable on a user-owned repo. (`manual.yml`, the old owner's SSH deploy to `catchlogx.test.a19.at`, was removed in #136.)

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
  api/upload/           Excel upload (new = bulk 1..N files, my, error-report, template-file)
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
  uploadService.ts      Excel bulk upload: validate all files, all-or-nothing store, report (#88)
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
