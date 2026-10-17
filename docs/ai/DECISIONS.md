# Decisions

Architectural and technical decisions made in this project.
Each entry documents WHAT was decided and WHY.

## 2026-04-27: Custom Session System Over NextAuth Sessions
- **Choice**: API routes use a hand-rolled cookie-based session system (`session-token` cookie → `Session` table) instead of NextAuth's `getServerSession()`
- **Reason**: Simpler cookie-based auth that integrates directly with the Prisma `Session` model and enables admin role checks
- **Considered**: Using NextAuth JWT sessions exclusively via the configured `[...nextauth]` route
- **Tradeoff**: NextAuth v4 is configured but unused by the UI; dual auth code exists but only the custom system is active

## 2026-04-27: Prisma Client Inside App Directory
- **Choice**: Prisma generator outputs to `../app/generated/prisma` instead of the default `node_modules/.prisma/client`
- **Reason**: Bundles the generated client with the app code, avoids node_modules resolution quirks in Next.js
- **Considered**: Default output path
- **Tradeoff**: Must run `npx prisma generate` manually after schema changes; import path is relative (`"../app/generated/prisma"`) not via `@prisma/client`

## 2026-04-27: PostgreSQL Over SQLite
- **Choice**: Migrated database from SQLite to PostgreSQL 16
- **Reason**: Needed for production deployment; SQLite was a dev-only stopgap (issue #45)
- **Considered**: Staying on SQLite
- **Tradeoff**: Requires Docker/PostgreSQL running locally; adds infrastructure complexity

## 2026-04-27: Service Layer Pattern
- **Choice**: All business logic moved from API route handlers into dedicated `services/*.ts` modules
- **Reason**: Separates HTTP concerns from business logic, improves testability and reuse
- **Considered**: Logic inline in route handlers (was the prior pattern)
- **Tradeoff**: More files; must follow the pattern consistently

## 2026-04-27: MinIO for File Storage
- **Choice**: Files stored in MinIO (S3-compatible container) instead of local filesystem or database
- **Reason**: Production-ready object storage that avoids filesystem coupling; enables scaling (issue #58)
- **Considered**: Local filesystem storage, PostgreSQL BYTEA columns
- **Tradeoff**: Requires MinIO container running; adds a second infrastructure dependency alongside PostgreSQL

## 2026-04-27: English as UI Language
- **Choice**: Switched all UI text from German to English (commit #57)
- **Reason**: Consistent with codebase (code comments are English), broader accessibility
- **Considered**: Keeping German, or supporting both
- **Tradeoff**: Legacy German strings may still exist in older components

## 2026-09-22: Pin @types/node via npm overrides
- **Choice**: Force `@types/node` to the root `^20` spec for all nested dependents via `"overrides": { "@types/node": "$@types/node" }` in `package.json` (issue #112)
- **Reason**: `vitest@5.0.1` declares peerOptional `@types/node@"^22.0.0 || >=24.0.0"`, so `npm ci` on clean machines (CI) pulled `@types/node@26` and died with ERESOLVE before lint/tests ran; overrides keep a single v20 tree deterministically
- **Considered**: Bumping `@types/node` to ^22/^24 (larger blast radius), downgrading vitest (wrong direction), `--legacy-peer-deps` in workflow/hook (masks instead of fixing)
- **Tradeoff**: If a future dependency genuinely needs `@types/node ≥ 22` types, the override must be revisited

## 2026-09-22: Add typecheck gate; stop suppressing pre-push gate output
- **Choice**: Add `"typecheck": "tsc --noEmit"` to `package.json` and run it in both `.github/workflows/test.yml` and `.githooks/pre-push`, alongside lint and tests (issue #112). Also removed the `>/dev/null 2>&1` redirects in the pre-push hook so a gate failure prints its real output inline instead of pointing to a second manual run.
- **Reason**: `AGENTS.md` previously noted "no typecheck script is configured" — TypeScript errors only surfaced at `next build`, so the lint+test gate could still let a broken build through. Suppressed hook output also meant every local failure required re-running the command by hand to see why.
- **Considered**: Leaving typecheck to `next build` only (status quo) — rejected because it means the pre-push/CI gate isn't actually a complete correctness gate.
- **Tradeoff**: `tsc --noEmit` adds a few seconds to both the pre-push hook and CI run.

## 2026-09-28: Mock I/O modules in unit tests instead of pure-logic-only
- **Choice**: Unit tests may replace `@/lib/prisma`, `@/lib/minio`, `@/lib/mailer`, `bcrypt`, `nodemailer`, `minio` and `fetch` with `vi.mock` / `vi.stubGlobal`. Inner helpers are lifted to module level and exported for tests (marked `// Exported for unit tests (#112).`), without behaviour changes (issue #112).
- **Reason**: The "pure logic only" rule left the most important logic untested — role/permission checks in `adminService.updateUser`/`deleteUser`, session expiry, the Excel import into the DB. Mocks keep `npm test` fast and infrastructure-free, so it still runs in the pre-push hook and CI.
- **Considered**: Pure logic only (status quo, leaves permissions untested); integration tests against a Docker PostgreSQL/MinIO (slow, needs services in CI and the hook).
- **Tradeoff**: Mocks encode the current Prisma call shapes — renaming a query argument breaks tests even if behaviour is unchanged. Real DB constraints are not exercised.

## 2026-04-27: Enum-based State Management
- **Choice**: Upload and password reset states use Prisma enums (`UploadStates`, `PasswordResetStates`) instead of raw strings
- **Reason**: Type safety and self-documenting state transitions
- **Considered**: String-based states
- **Tradeoff**: Enum values are hard-coded in schema; changing them requires migration

## 2026-10-16: No self-managed maintenance tunnels into the BOKUnet
- **Choice**: Maintenance access to the BOKU production server goes only through the paths the university sanctions — BOKU VPN (Cisco AnyConnect) with the Funktionsaccount + MFA (#84), or on-site (#122). No server-initiated standing tunnel: neither an external VPN bridging the server into a third-party network, nor a reverse SSH tunnel to a VPS, nor that same tunnel carried inside HTTPS/WebSocket (a `wstunnel`-style reverse tunnel, i.e. `ssh` through an existing nginx TLS vhost). From the network's point of view all three are the same thing.
- **Reason**: A permanent outbound connection creates inbound reachability into the department segment — an approval-required active network component and a firewall bypass — regardless of whether a `tun0` interface appears and regardless of whether the carrier is TCP/22 or TLS/443. BOKUnet rules forbid split tunnelling, require prior written approval for active network components, and BOKU-IT can take an entire subnet off the network on violation. Full sourced reasoning in #115.
- **Considered**: (a) server joins a self-operated external VPN — rejected; (b) permanent reverse SSH tunnel (server → VPS, `ssh localhost:2222` at the VPS) — rejected; (c) the same reverse tunnel wrapped in HTTPS/WebSocket (TLS carrier with WebSocket multiplexing, e.g. `wstunnel -R`, or plain `ssh` behind a dedicated nginx TLS vhost) — rejected: functionally identical to (b), only the encapsulation differs. It is *more* tempting than (b) precisely because it survives a firewall that blocks port 22 — which is exactly the property that makes it a bypass rather than a sanctioned path. The surrounding technique remains legitimate for infrastructure Georg owns (e.g. reaching claw or his own devices), where he is the network owner; it is excluded here only because of who owns the BOKUnet. (d) hosting the app externally on Georg's own VPS, which removes the need for BOKUnet maintenance access altogether — open, needs the client's consent (data protection / responsibility). (e) on-site maintenance only until BOKU-IT answers — the current fallback.
- **Tradeoff**: Until BOKU-IT answers (#115) or an on-site visit happens (#122) there is no direct maintenance path at all — no "fix it quickly" option, and every intervention needs a coordinated appointment. Accepted deliberately: the downside of a firewall bypass (subnet removal, loss of VPN/account rights) is far larger than the downside of slow maintenance.

## 2026-10-17: Dev-Instanz selbstgebautes MinIO, mc aus apt
- **Choice**: On the `catchlogx.graf.priv.at` dev instance, MinIO runs as a binary built from the upstream source tarball of tag `RELEASE.2025-10-15T17-29-55Z` (`go build`, user unit `minio.service`); `mc` comes from Ubuntu's `minio-client` package instead of being built from source
- **Reason**: MinIO is no longer obtainable as a container image or prebuilt binary (repo archived 2026-04, Docker Hub blocked for the namespaces, `dl.min.io` answers 410, GitHub releases carry no assets, snap channels are 2018-era stubs); the upstream README now recommends building from source. `minio-client` is packaged and security-maintained in Ubuntu 26.04 universe, so building `mc` too would have been unnecessary work
- **Considered**: Docker image transfer from another host, S3 alternatives (Garage/SeaweedFS), snap (`minio` snap only has an unmaintained 2018 edge build)
- **Tradeoff**: MinIO server binary is not updated by apt and must be rebuilt manually from a newer tag; build needs a Go toolchain (`golang-go` from apt) and ~2 min link step on this VPS

## 2026-10-17: Befischungsdaten in eigenem privaten Repo, nicht hier
- **Choice**: Die Excel-Datenlieferungen der BOKU-Hydrobiologie liegen im privaten Schwesterrepo `georgernstgraf/CatchLogX-Data` (Trunk `main`, kein Git LFS, Struktur 1:1 wie geliefert). Dieses Repo enthält ausschließlich Anwendungscode.
- **Reason**: CatchLogX ist **public** — Forschungsdaten dürfen dort nicht hinein. Ein eigenes Repo hält die Code-Historie klein und lässt den Bestand generationenweise (Roh-Export / Lenas Überarbeitung / Letztstand) versionieren (#125).
- **Considered**: (a) Daten in CatchLogX committen — abgelehnt, public; (b) Git LFS im Datenrepo — abgelehnt, 1 GB Storage/Monat Gratis-Quota und `git lfs install`-Zwang für jeden Klon; (c) eigener Branch im selben Repo — abgelehnt, Historie und Zugriffsrechte nicht trennbar.
- **Tradeoff**: Ohne LFS kostet jede künftige Datenlieferung die volle Dateigröße in der Git-Historie. Zugriffsrechte müssen in zwei Repos gepflegt werden.
