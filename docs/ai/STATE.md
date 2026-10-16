# Project State

Current status as of 2026-10-15.

## Current Focus
New diploma group taking over (2026-09). **Trunk-based development on `dev`** — no feature branches; `git pull --ff-only origin dev` at session start. `master` is production (protected: PR + 1 approval, enforced for admins), merges come from `dev` only. Pre-push lint+typecheck+test gate protects `dev` (`.githooks/pre-push`, auto-activated via `prepare` script on `npm ci`/`npm install`, fallback `git config core.hooksPath .githooks`). **CI (`.github/workflows/test.yml`) is source of truth** — lint+typecheck+test on push/PR to `dev`/`master`; the local hook is fast feedback only.

Kickoff meeting 2026-09-19 (see `docs/meetings/2026-09-19-kickoff.md`, protocol + assignments in #113). Roles: Dominik (backend lead), Rodion (database), Armin + Alex (frontend), Jakob (testing). Domain contact: Lena (BOKU Hydrobiologie), technical: Martin Seebacher (`@Fishknut`). Weekly Zoom on Saturdays. Every open issue carries an assignee.

## Production & Infrastructure (BOKU)
- Production server: desktop-class machine on Martin Seebacher's desk (institute IT, OE-level) in the BOKUnet, productive since June 2026, informal email accreditation only (#115)
- General (depersonalized) maintenance inquiry sent to `boku-it@boku.ac.at` (actual sent version in `docs/boku-it-auskunft-mail.md`); answer pending
- On-site maintenance visit by Georg at Martin's planned — checklist in #122 (backup, documented SSH access instead of hidden tunnel, secret rotation, old runner removal)
- VPS instance `catchlogx.graf.priv.at` created on Georg's VPS; students will deploy a copy there; second self-hosted Actions-Runner planned on the VPS (#123)
- **Runner reality (2026-10-16):** `master` already deploys through a repo-level self-hosted runner — `production-deploy.yml` uses `runs-on: [self-hosted, linux, x64]`, which is answered by `catchlogx-server` (Linux, online, idle; automatic labels only, no custom label). It appears to be the leftover runner from the previous diploma team on the BOKU machine and last deployed on 2026-07-13, i.e. it is *live infrastructure*, not a leftover to be deleted: #122's "remove the old runner" item would break the production deploy and is blocked behind the BOKU-IT answer in #115. Intended shape once that answer is in — production runner on the BOKU machine, test runner on the VPS (#123) — requires distinct custom labels (`boku-prod` / `vps-dev`) because a personal user account has no runner groups (see PITFALLS.md).

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
- [x] Unit tests for all services + `lib/` helpers + `middleware.ts` (I/O mocked via `vi.mock`, see #112). Not covered: API route handlers, React components, `downloadDummyFile` (needs DOM)
- [ ] Fish search component was removed (issue #60)
- [ ] 26 Dependabot alerts incl. 4 critical (see #109)
- [ ] BOKU-IT answer to the maintenance inquiry pending (see #115)

## Blockers
None.

## Next Session Suggestion
On-site visit prep (#122) and VPS runner setup (#123) are the active infrastructure threads; code-wise, create proper Prisma migrations to replace the `prisma db push` workflow and add route-handler/component tests (jsdom + Testing Library).
