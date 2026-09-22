# Pitfalls

Things that do not work, subtle bugs, and non-obvious constraints.
Read this file carefully before making changes in affected areas.

- Prisma client is at `app/generated/prisma/` — import as `"../app/generated/prisma"`, NOT `@prisma/client`. The generated directory is gitignored.
- After ANY schema change, run `npx prisma generate` — Next.js does not auto-regenerate the Prisma client
- `prisma db push` is used instead of migrations — never run `prisma migrate dev` on dev without coordinating
- `middleware.ts` runs in Edge Runtime — Prisma cannot be imported there. Keep it to lightweight cookie checks only
- MinIO must be running for any upload or download to work (`docker compose up -d minio minio-init`)
- PostgreSQL must be running for any app to work (`docker compose up -d db`)
- `lib/mailer.ts` throws if nodemailer env vars are missing — password reset routes will fail without configured SMTP
- `scripts/create-user.ts` hardcodes `admin`/`admin` credentials — dev-only script, NOT for production
- Docker Compose `app` service runs `npx prisma db push` on every startup — schema changes are applied automatically in production
- `no-explicit-any` ESLint rule is disabled — TypeScript `any` is allowed in this codebase
- `overrides` in `package.json` pins `@types/node` to the root spec (`"$@types/node"`): vitest 5 requires peerOptional `@types/node ^22 || >=24`, which breaks `npm ci` with ERESOLVE on clean machines while a stale local `node_modules` masks it. After touching any `@types/*` range, always verify with a fresh `rm -rf node_modules && npm install`.
