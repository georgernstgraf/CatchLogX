# Architecture

Living structural map of the system as of 2026-04-27.
Overwritten when structural changes occur during a session.

## Overview
CatchLogX is a Next.js 16.0 web application for BOKU Wien's hydrobiology department.
It manages fish catch data via Excel upload, SQL querying, and visualization.
Stack: Next.js App Router, TypeScript, Prisma ORM + PostgreSQL, Tailwind CSS v4, NextAuth.js v4.
Infrastructure: PostgreSQL 16 + MinIO via Docker Compose.

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
  api/upload/           Excel upload (new, my, dummy-file)
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
  AdminDummyFilesManager.tsx Dummy file management UI
  MyUploadsPageComponent.tsx User's upload list
lib/                    Server-side utilities
  prisma.ts             Prisma singleton (imports from app/generated/prisma)
  session.ts            Custom session management (cookie → Session table → user)
  auth.ts               NextAuth config (credentials provider, JWT sessions — unused by UI)
  auth-middleware.ts    requireAuth() + withAuth() wrappers for API routes
  admin-middleware.ts   requireAdminAuth() + withAdminAuth() for admin routes
  minio.ts              MinIO client (file upload/download, bucket management)
  mailer.ts             Nodemailer SMTP transport (password reset emails)
  dummy-files.ts        Dummy file tracking helpers
services/               Business logic layer (API routes delegate here)
  authService.ts        Sign-in, session validation
  passwordService.ts    Forgot-password, reset, change-initial-password
  adminService.ts       User CRUD, upload approval/rejection, file downloads
  queryService.ts       SQL query validation, execution, save/delete
  uploadService.ts      Excel upload, validation, DB insertion
prisma/
  schema.prisma         Data model + generator (output: app/generated/prisma)
  migrations/           Historical migrations (not actively maintained — use db push)
scripts/                Dev utilities
  create-user.ts        User creation (admin/admin)
  insert-fish.ts        Seed fish species
  insert-river-sites.ts Seed river sites
  insert-samplings.ts   Seed samplings
  insert-fish-catches.ts Seed fish catches
  wipe-and-seed.ts      Wipe and re-seed all data
  wipe-fish.ts          Wipe fish species only
middleware.ts           Edge middleware (cookie check on /api/admin/* paths)
docker-compose.yml      PostgreSQL 16 + MinIO + app stack
```

## Data Model
```
User ──< Session             (custom auth)
User ──< Uploads             (excel upload tracking)
User ──< UserQueries          (saved SQL queries)
UploadStates: UPLOADED | ACCEPTED | REJECTED | DB_ERROR | SAVED_IN_DB
PasswordResetStates: REQUESTED | EXPIRED | DONE

DummyFiles                    (MinIO dummy upload metadata)

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
1. `docker compose up -d db minio minio-init` (PostgreSQL + MinIO)
2. Set `DATABASE_URL` and MinIO env vars in `.env`
3. `npx prisma generate`
4. `npx prisma db push`
5. `npm run create-user` (optional: + seed scripts)
6. `npm run dev`
