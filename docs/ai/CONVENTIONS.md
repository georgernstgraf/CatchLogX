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

## Environment Variables
Required: `DATABASE_URL` (PostgreSQL connection string).
Mailer vars: `NODEMAILER_HOST`, `NODEMAILER_PORT`, `NODEMAILER_USER`, `NODEMAILER_PASSWORD`, `NODEMAILER_SECURE`.
