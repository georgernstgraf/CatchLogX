# Architecture

Living structural map of the system as of 2026-10-17.
Overwritten when structural changes occur during a session.

## Overview
CatchLogX is a Next.js 16.0 web application for BOKU Wien's hydrobiology department.
It manages fish catch data via Excel upload, SQL querying, and visualization.
Stack: Next.js App Router, TypeScript, Prisma ORM + PostgreSQL, Tailwind CSS v4, NextAuth.js v4.
Infrastructure: PostgreSQL 16 — `docker compose` for local development and CI; **native clusters** (`postgresql@16-main`) on both the dev instance (#168) and production (#170). File bytes (uploads + templates) live in the database as `FileBlob` (`bytea`), so no object store is needed (#131).

## Repositories
- **`georgernstgraf/CatchLogX`** (this repo, **public**) — application code only.
- **`georgernstgraf/CatchLogX-Data`** (**private**) — the Excel deliveries from BOKU hydrobiology (provenance, structure, and naming conventions in its own README and `docs/ai/`); trunk `main`, no Git LFS, append-only. The data itself must never land in this public repo (#125).

## Deployment Topology
- **Local development** — `docker compose up -d` (PostgreSQL 16 + app container), app on port 3001.
- **Production (BOKU)** — desktop-class machine on Martin Seebacher's desk (institute IT, OE-level) inside the BOKUnet, productive since June 2026, so far accredited only informally by email. Maintenance access is deliberately restricted to university-sanctioned paths — see `DECISIONS.md` ("No self-managed maintenance tunnels into the BOKUnet") and #115. No standing tunnel, VPN bridge, or reverse tunnel may be attached to this machine. The path that actually exists since 2026-10-27 is an SSH login as **`root` with a single personal key** (no unprivileged account, no second person with access); documenting that with the OE is what #115 is still open for. Host networking is **static by design since 2026-10-27** — `/etc/netplan/00-installer-config.yaml` pins address, gateway and DNS, `/etc/chrony/sources.d/10-boku.sources` pins the BOKU time servers, and **no NIC uses DHCP** (a DHCP lease change had moved production off its address and locked every user out); see `PITFALLS.md` and `STATE.md`. The machine was upgraded in the on-site window (#122) on 2026-10-18: the **db-push era is over** — its database was adopted in place, data-preservingly (#139/#141, see `DECISIONS.md`), and is now migration-tracked; and since #143 the app runs as a **systemd user unit** exactly like the dev instance, not as a container:
  - the unit `catchlogx.service` runs `node ~/current/server.js` (`~/current` → `~/releases/<sha>/`, Next.js `output: "standalone"`), listening on **`127.0.0.1:3001` only** since #164 — nginx (system service) terminates the public entry on `:80` and proxies to the app, and `141.244.222.191:3001` is a `301` to port 80 for bookmarks from before #164. The app is therefore no longer network-reachable; a restart is ~2 s with **no** build. The machine-side configs (netplan, nginx, the app unit, the chrony sources and the wait-online drop-in) are mirrored secrets-free in `deploy/prod/`, because the host has no SVN access (`EDV/Deployed/<host>` is committed from the host itself). Live release since 2026-10-27: `37fbcf7` (the #164 deploy, re-baked with the corrected URL); `linger` is enabled for `clxadmin`, so the unit starts on boot without anyone logging in (verified: `NRestarts=0`, active ~26 s after a reboot, re-verified after the #164 reboot);
  - Node is a pinned official tarball under `~/tools/node-v22.23.3` (`~/tools/node` symlink; glibc — the runner's `actions/setup-node` uses the same major 22);
  - the runtime env lives **on the machine** in `/home/clxadmin/.config/catchlogx/.env` (mode 600, outside the repo so no checkout can overwrite it); since #122 **nothing of `clxadmin` lives outside its home** — the Actions runner is a user unit (`~/.config/systemd/user/actions.runner.AlphaVIE-CatchLogX…`, `~/actions-runner`), the old `/opt/CatchLogX` checkout is deleted and the runbook checkout is root-owned and re-cloned on demand into `/root/CatchLogX` (`deploy/prod/postgres/*`, `deploy/postgres/*`);
  - **PostgreSQL is a native cluster since 2026-10-30 (#170)**: `postgresql@16-main` (PGDG 16), config in `/etc/postgresql/16/main/conf.d/99-catchlogx.conf`, data in `/var/lib/postgresql/16/main`, running on `0.0.0.0:5432` — deliberately BOKU-wide open, see #152: the boundary is the `clx_readonly` role, not the port. TLS is offered (self-signed, `sslmode=prefer` encrypts automatically) but not enforced. The old container `clx-postgres` is **stopped with `restart=no`, volume `catchlogx_clx_pgdata` intact** as the rollback path; `docker-compose.prod.yml` puts every base service behind never-activated profiles, so `docker compose up -d` on the machine starts **nothing** (see `PITFALLS.md`). The MinIO containers were removed on 2026-10-27; the volume `catchlogx_clx_miniodata` is kept until the 2026-10-18 backup set (21 objects, 54 M) is judged dispensable.
  Until the gated pipeline (#144) lands, deploys go through the **interim, manual** `production-deploy.yml`: it ships a deliberately chosen `master` commit, builds once in the job with native glibc Node 22 (never an alpine container build — the traced `bcrypt`/Prisma binaries would not run on the host), applies migrations, publishes an immutable release (`scripts/publish-release.sh`), retires the interim `clx-web` container if it still exists, restarts the unit and health-checks `127.0.0.1:3001`. Its **adopted-schema guard** queries the native cluster over the local socket (peer auth as `clxadmin`) and refuses to deploy unless `_prisma_migrations` exists, the baseline is recorded and no migration is half-applied. **Rollback = re-dispatch the same job with `ref` set to the full SHA of the previous `master` commit** — the job rebuilds that commit (a deploy always builds; only a restart is build-free) and republishes it, so the result is deterministic. Short SHAs do **not** work: `actions/checkout` resolves branches and tags only (#163).
- **Dev instance `catchlogx.graf.priv.at`** — CNAME to `claw.graf.priv.at` (Georg's own VPS). Since 2026-10-17 the students' development copy runs there (#126), entirely under the dedicated system user `catchlogx` with **no root at runtime**. This is also a machine where agent sessions (opencode) run directly — the repo clone lives here, so an agent's shell shares the host with the live app unit and the deploy runner (see `AGENTS.md` "Agent Sessions" and `PITFALLS.md`):
  - rootless Docker (socket `/run/user/1003/docker.sock`) ran only PostgreSQL 16 from `~/dev-stack/docker-compose.yml`, bound to `127.0.0.1:5432`; volume `clx_pgdata`. **Since 2026-10-28 (#168) the dev database is native**: PostgreSQL 16.15 (PGDG) as system service `postgresql@16-main` on `0.0.0.0:5432` — see the dev-instance decision below and DECISIONS.md ("Dev-VPS: Postgres nativ"); the container is kept stopped as a fallback (volume `clx_pgdata` intact);
  - file bytes are stored in this PostgreSQL (table `FileBlob`); the former MinIO binary/`minio.service` unit and the `mc` client are obsolete since #131 (upload/download need no second service);
  - the app serves an **immutable release**: user unit `catchlogx.service` runs `node ~/current/server.js` (`~/current` → `~/releases/<sha>/`, Next.js `output: "standalone"`), on `127.0.0.1:40873`; repo clone at `~/repos/georgernstgraf/CatchLogX` (branch `dev`). Deploys are push-driven (see the deploy-paths table below): the `deploy` job builds in the self-hosted runner, `scripts/publish-release.sh` publishes `~/releases/<sha>/` and atomically swaps `~/current`, then `prisma migrate deploy` → `systemctl --user restart catchlogx.service` → health check. A plain restart is therefore ~2 s with no build; rollback = repoint `~/current` and restart. The superseded `clx-app.service` and `catchlogx-update.service` (and `~/.config/catchlogx/deploy.sh`) are retired — `clx-app.service`'s file remains in `~/.config/systemd/user/`;
  - nginx on 443 terminates TLS (Let's Encrypt, certbot) and reverse-proxies to `127.0.0.1:40873`. The certificate and its private key are additionally copied to `~/certs/` (`fullchain.pem` 0644, `privkey.pem` 0600) by the certbot deploy hook `deploy/vps/certs/catchlogx-certs-sync.sh` (#167), so processes running as `catchlogx` can serve TLS themselves; the hook runs on every renewal because certbot rotates the key (no `--reuse-key`). nginx keeps reading the Let's Encrypt paths directly;
  - secrets live only in `~/dev-stack/.env` and the app's `.env` (mode 600, gitignored) — never in this repo or in SVN docs; the deploy job reads the app `.env` from that host path (the runner's checkout has no `.env`);
  - the nginx vhost, the systemd user units and the dev-stack compose file are mirrored in the claw deployment tree (SVN), not in this repo (the 2026-10-17 `catchlogx` unit and the new `actions.runner.catchlogx-vps.service` are not yet mirrored there; the retired `catchlogx-update` unit and `~/.config/catchlogx/deploy.sh` are gone).
  A self-hosted GitHub Actions runner now runs on this machine as user unit `actions.runner.catchlogx-vps.service` (label `vps`, repo runner 22), so deploy jobs can `systemctl --user`-restart the app directly (#123/#135).

### Deploy paths (workflows)
| Workflow | Trigger | Runs on | What it does |
|---|---|---|---|
| `ci.yml` | push/PR to `dev`, `master` | GitHub-hosted | lint + typecheck + test (the correctness gate) + `migration-drift` |
| `deploy-dev.yml` | `CI` concluded successfully on `dev`, or manual dispatch | `[self-hosted, vps]` | builds a standalone release on push to `dev`, publishes `~/releases/<sha>`, runs `prisma migrate deploy`, restarts `catchlogx.service` and health-checks it. `needs:` cannot cross workflows, so the gate is `workflow_run` + an `if` on the job |
| `production-deploy.yml` | **manual dispatch only** (interim, #142→#143; the push trigger returns with #144) | `[self-hosted, boku]` | Interim production deploy. Verifies the requested `ref` is reachable from `master`, then an **adopted-schema guard** queries the native cluster over the local socket and refuses to run unless `_prisma_migrations` exists, the baseline is recorded as applied and no migration is half-applied. Copies the on-machine env file (`/home/clxadmin/.config/catchlogx/.env`) into the workspace (the build inlines `NEXT_PUBLIC_*`), builds **once in the job** with native glibc Node 22 (never an alpine container build, #143), runs `prisma migrate deploy`, publishes an immutable release via `scripts/publish-release.sh` (`~/releases/<sha>` + atomic `~/current` swap), restarts the systemd user unit `catchlogx.service`, health-checks `127.0.0.1:3001` and reports the deployed commit. Rollback = re-dispatch with `ref=<full SHA of the previous master commit>` (the job rebuilds that commit — a short SHA is not resolvable, #163) |

**Production maintenance is no longer a workflow** (#170). `production-maintenance.yml` held eight dispatch-only jobs: five one-shot operations that had already run (audit #138, rehearsal #140, cutover #141, smoke user #150, release topology #143) and three recurring ones. Since 2026-10-27 there is direct SSH as `root` over the BOKU VPN — the sanctioned path per `DECISIONS.md` (2026-10-16) — so the file was deleted instead of being converted from 67 `docker exec` calls to host commands. What remains recurring lives next to the code and is run from a root-owned checkout of this repo (`git clone https://github.com/georgernstgraf/CatchLogX /root/CatchLogX`, re-clone whenever it is stale — the old `/opt/CatchLogX` checkout is gone with #122): `deploy/prod/postgres/readonly-role.sh` (role grants + password rotation, `KEEP_PASSWORD=1` for verify-only), `deploy/prod/postgres/observability-extension.sql`, `deploy/postgres/report.sql`, and `deploy/prod/postgres/README.md` as the runbook (migration window, rollback, research-group access). Dumps and query texts still never leave the machine — the repo is public.

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
  seedSequences.ts      Moves id sequences past fixed ids written by seed scripts
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
docker-compose.prod.yml Production override (#143): disables the base `app` service via the never-activated profile `interim-container` (the app is a systemd unit on prod, not a container)
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
3. `npm run prisma:generate`
4. `npm run prisma:deploy`
5. `npm run create-user` (optional: + seed scripts)
6. `npm run dev`
