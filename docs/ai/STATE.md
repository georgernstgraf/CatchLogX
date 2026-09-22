# Project State

Current status as of 2026-09-19.

## Current Focus
New diploma group taking over (2026-09). **Trunk-based development on `dev`** — no feature branches; `git pull --ff-only origin dev` at session start. `master` is production (protected: PR + 1 approval, enforced for admins), merges come from `dev` only. Pre-push lint+typecheck+test gate protects `dev` (`.githooks/pre-push`, auto-activated via `prepare` script on `npm ci`/`npm install`, fallback `git config core.hooksPath .githooks`). **CI (`.github/workflows/test.yml`) is source of truth** — lint+typecheck+test on push/PR to `dev`/`master`; the local hook is fast feedback only.

Kickoff meeting 2026-09-19 (see `docs/meetings/2026-09-19-kickoff.md`, protocol + assignments in #113). Roles: Dominik (backend lead), Rodion (database), Armin + Alex (frontend), Jakob (testing). Domain contact: Lena (BOKU Hydrobiologie), technical: Martin Seebacher (`@Fishknut`). Weekly Zoom on Saturdays. Every open issue carries an assignee.

## Completed (this cycle)
- [x] Custom cookie-based session auth (sign-in, session, logout)
- [x] Admin panel with user CRUD, upload approval/rejection, file downloads
- [x] Excel upload with validation (schema, PIT tag, cross-file checks)
- [x] SQL query interface with execution, save/load/delete, CSV export, preset queries
- [x] Leaflet map component with marker support
- [x] MinIO file storage (uploads + dummy files)
- [x] PostgreSQL migration (from SQLite)
- [x] Dark mode support
- [x] Password reset flow (email via nodemailer)
- [x] First-login password change
- [x] Service layer pattern (all API routes delegate to services/)
- [x] PIT tag fields (pitDec, pitHex, recapture) on FishCatch
- [x] Language switched to English
- [x] Docker Compose for full stack (PostgreSQL + MinIO + app)
- [x] AGENTS.md + docs/ai/ knowledge files created

## Pending
- [ ] Database migrations are not current — `prisma db push` is used instead of `prisma migrate dev`
- [ ] NextAuth v4 is configured but not integrated with the custom session system
- [x] Test runner introduced (Vitest + pre-push test gate, see #112)
- [x] CI test gate (`.github/workflows/test.yml`: lint+test on push/PR to `dev`/`master`, see #112)
- [x] Typecheck gate added (`tsc --noEmit`, in both pre-push hook and CI; pre-push output no longer suppressed, see #112)
- [ ] Fish search component was removed (issue #60)
- [ ] 26 Dependabot alerts incl. 4 critical (see #109)

## Blockers
None.

## Next Session Suggestion
Create proper Prisma migrations to replace the `prisma db push` workflow, or implement automated tests.
