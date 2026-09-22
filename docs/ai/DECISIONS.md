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

## 2026-04-27: Enum-based State Management
- **Choice**: Upload and password reset states use Prisma enums (`UploadStates`, `PasswordResetStates`) instead of raw strings
- **Reason**: Type safety and self-documenting state transitions
- **Considered**: String-based states
- **Tradeoff**: Enum values are hard-coded in schema; changing them requires migration
