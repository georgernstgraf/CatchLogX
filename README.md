# CatchLogX 🐟

**CatchLogX** ist eine moderne Web-Anwendung für die Verwaltung und Analyse von Befischungsdaten, entwickelt als Diplomprojekt an der HTL Spengergasse für die Universität für Bodenkultur Wien (BOKU), Abteilung für Hydrobiologie.

## 📋 Projektbeschreibung

Die Anwendung ermöglicht es Mitarbeitern der BOKU Wien, Befischungsdaten zu erfassen, zu verwalten und zu analysieren. Über eine intuitive Web-Oberfläche können Excel-Dateien hochgeladen, SQL-Abfragen durchgeführt und Daten visualisiert werden.

### Hauptfunktionen

- 🔐 **Sichere Authentifizierung** mit rollenbasierter Zugriffskontrolle
- 📊 **Excel-Upload** für Befischungsdaten
- 🗄️ **SQL-Abfrage-Interface** für erweiterte Datenanalyse
- 👥 **Admin Panel** für Benutzerverwaltung
- 🗂️ **Datenbank-Management** mit Prisma ORM

## 🛠️ Technologie-Stack

### Frontend

- **Next.js 16.0** - React Framework mit App Router
- **React 19** - UI Library
- **TypeScript** (strict) - Type-Safe JavaScript
- **Tailwind CSS 4** - Utility-First CSS Framework
- **Lucide React** - Icon Library
- **Leaflet / React Leaflet** - Kartenansicht der Befischungsstellen

### Backend

- **Next.js API Routes** - dünne HTTP-Schicht, Logik liegt in `services/`
- **PostgreSQL 16** - Datenbank (Docker)
- **Prisma 6** - ORM (Client wird nach `app/generated/prisma` generiert)
- **MinIO** - S3-kompatibler Dateispeicher für Uploads (Docker, Bucket `catchlogx-files`)
- **Eigenes Cookie-Session-System** - `session-token`-Cookie → `Session`-Tabelle
- **bcrypt** - Passwort-Hashing
- **Nodemailer** - E-Mails für Passwort-Reset
- **ExcelJS / xlsx** - Einlesen der Excel-Uploads

> NextAuth.js ist konfiguriert (`lib/auth.ts`), wird von der Oberfläche aber **nicht** verwendet.

### Development Tools

- **ESLint** - Code Linting
- **TypeScript** (`tsc --noEmit`) - Static Type Checking
- **Vitest** - Unit-Tests
- **Docker Compose** - PostgreSQL + MinIO (+ App)

## 🚀 Lokales Setup

Voraussetzungen: Node.js 20, Docker.

```bash
# 1. PostgreSQL + MinIO starten
docker compose up -d db minio minio-init

# 2. .env anlegen: DATABASE_URL, MINIO_* und NODEMAILER_* setzen

# 3. Prisma-Client generieren (nach jeder Schema-Änderung wiederholen)
npx prisma generate

# 4. Schema in die Datenbank übernehmen
npx prisma db push

# 5. Dev-Benutzer + Demo-Datensatz (Arten, Standorte, Befischungen, Fänge,
#    Vorlagedateien) anlegen — idempotent, mehrfach ausführbar
npm run seed:demo

# 6. Entwicklungsserver starten
npm run dev
```

## 🏗️ Datenbank-Schema

Das Projekt verwendet ein relationales Datenbankschema für Befischungsdaten:

- **Users**: Benutzer mit Rollen (Admin, Viewer)
- **RiverSite**: Gewässerstandorte mit GPS-Koordinaten
- **Sampling**: Befischungsveranstaltungen mit Umweltdaten
- **FishCatch**: Einzelne Fischfänge mit Gewicht und Länge
- **FishSpecies**: Fischarten mit deutschen und lateinischen Namen

### Benutzerrollen

- **Admin**: Vollzugriff auf alle Funktionen und Benutzerverwaltung
- **Viewer**: Nur Lesezugriff auf Daten und SQL-Abfragen

## 📁 Projektstruktur

```
CatchLogX/
├── app/                      # Next.js App Router (Seiten + API Routes)
│   ├── api/
│   │   ├── auth/             # Sign-in, Session, Logout, Initial-Passwort
│   │   ├── admin/            # Benutzer-, Upload- und Dateiverwaltung
│   │   ├── query/            # SQL-Abfragen ausführen/speichern
│   │   ├── upload/           # Excel-Upload
│   │   ├── forgot-password/  # Passwort vergessen
│   │   └── reset-password/   # Passwort zurücksetzen
│   ├── admin/                # Admin Panel
│   ├── upload/               # Upload-Seite
│   ├── my-uploads/           # Eigene Uploads
│   ├── about/                # Über / Kontakt
│   ├── login/                # Login-Seite
│   ├── first-login/          # Passwortwechsel beim ersten Login
│   ├── forgot-password/      # Passwort vergessen
│   ├── reset-password/       # Passwort-Reset
│   └── generated/prisma/     # Generierter Prisma-Client (gitignored)
├── components/               # React-Komponenten (alle client-seitig)
│   ├── AuthProvider.tsx      # Auth-Context + useAuth()
│   ├── ProtectedRoute.tsx    # Route Guard
│   ├── SqlQueryComponent.tsx # SQL-Abfrage-UI + Karte
│   ├── UploadPageComponent.tsx
│   ├── AdminPageComponent.tsx
│   └── ...
├── services/                 # Business-Logik (API Routes delegieren hierher)
│   ├── authService.ts
│   ├── adminService.ts
│   ├── passwordService.ts
│   ├── queryService.ts
│   └── uploadService.ts
├── lib/                      # Server-Utilities
│   ├── prisma.ts             # Prisma-Singleton
│   ├── session.ts            # Session-Validierung
│   ├── auth-middleware.ts    # requireAuth()
│   ├── admin-middleware.ts   # requireAdminAuth()
│   ├── minio.ts              # MinIO-Client
│   ├── mailer.ts             # Nodemailer
│   └── csv.ts                # CSV-Export-Escaping
├── prisma/
│   └── schema.prisma         # DB-Schema (Änderungen via `prisma db push`)
├── scripts/                  # create-user, Seed- und Wipe-Scripts
├── docs/ai/                  # Projektwissen (Architektur, Entscheidungen, ...)
├── samples/                  # Beispieldaten
├── middleware.ts             # Edge-Cookie-Check für /api/admin/*
└── docker-compose.yml        # PostgreSQL 16 + MinIO + App
```

## 🔧 Verfügbare Scripts

```bash
# Entwicklungsserver starten
npm run dev

# Produktions-Build erstellen
npm run build

# Produktionsserver starten
npm run start

# Code linting
npm run lint

# Typecheck
npm run typecheck

# Unit-Tests (Vitest)
npm test

# Prüfen, ob der Pre-push Hook aktiv ist
npm run check:hooks

# Vollständigen Demo-Datensatz anlegen (idempotent)
npm run seed:demo
```

## 🤝 Mitarbeit (Trunk-Based)

Gearbeitet wird direkt auf `dev` (`master` ist Produktion und bekommt nur PRs aus `dev`).
Jeder Push auf `dev` läuft lokal durch Lint + Typecheck + Tests (Pre-push Hook) — bei Rot bricht der Push ab.
Die GitHub-Action `Test` prüft dasselbe zusätzlich bei jedem Push/PR.

**Erstes Mal klonen:**
```bash
git clone https://github.com/georgernstgraf/CatchLogX
cd CatchLogX
npm ci          # installiert + aktiviert den Pre-push Hook automatisch
npm test        # Sanity-Check
git checkout dev
```

**Repo schon vorhanden (Sitzungsbeginn):**
```bash
git pull --ff-only origin dev
npm ci                          # Stand nachholen + Hook aktivieren, falls fehlend
git config core.hooksPath       # Kontrolle: muss ".githooks" ausgeben
```
Falls die Kontrolle leer ist (einmalig): `git config core.hooksPath .githooks`
Alternative Kontrolle: `npm run check:hooks`

**Team-Regeln:** nie `git push --no-verify`, rote CI sofort fixen, Commits immer mit Issue-Nummer (z. B. `fix: ... (#42)`).

## 📊 Features im Detail

### Dashboard

- Übersicht über hochgeladene Dateien
- Schnellzugriff auf häufig verwendete Funktionen
- Benutzerstatistiken

### Upload-System

- Excel-Dateien hochladen (.xlsx, .xls)
- Automatische Validierung der Datenstruktur
- Import in die Datenbank

### SQL-Abfrage-Tool

- Interaktiver SQL-Editor
- Syntax-Highlighting
- Ergebnis-Visualisierung
- Export-Funktionen

### Admin Panel

- Benutzerverwaltung
- Rollenverwaltung
- System-Überwachung

## 🎓 Diplomprojekt-Team

Entwickelt von Schülern der HTL Spengergasse als Abschlussprojekt.

### Aktuelles Team (seit 2026-09)

- Dominik (Backend Lead & Projekt-/Dokumentationskoordination)
- Rodion (Datenbank)
- Armin (Frontend Developer)
- Alex (Frontend Developer)
- Jakob (Testing)

### Erstes Team

- Arman (Team Lead & Backend Developer)
- Maxima (Vice Team Lead & Software Security Engineer)
- Burak (Database Designer)
- Tadeas (Frontend Developer & UI/UX)

### Betreuung & Ansprechpersonen

- Georg Graf (Betreuer, HTL Spengergasse)
- Lena (BOKU Hydrobiologie, fachliche Ansprechperson)
- Martin Seebacher (BOKU Hydrobiologie, Institut-IT / Produktionsserver)

## 🤝 Auftraggeber

**Universität für Bodenkultur Wien (BOKU)**
Abteilung für Hydrobiologie
Institut für Wasserwirtschaft, Hydrologie und konstruktiven Wasserbau

## 🗄️ Datenbestand

Die Befischungsdaten selbst liegen **nicht** in diesem Repository (es ist public), sondern im privaten Schwesterprojekt:

**→ [georgernstgraf/CatchLogX-Data](https://github.com/georgernstgraf/CatchLogX-Data)** — privates Datenrepository, Zugriff nur auf Einladung.

Dort sind die Excel-Lieferungen der BOKU-Hydrobiologie versioniert (Provenienz, Struktur und Namenskonventionen im README des Datenrepos). Dieses Repository enthält ausschließlich den Anwendungscode.

## 📄 Lizenz

Dieses Projekt wurde für die BOKU Wien entwickelt und dient ausschließlich akademischen und wissenschaftlichen Zwecken.

## 🐛 Bug Reports & Feature Requests

Bei Problemen oder Verbesserungsvorschlägen erstellen Sie bitte ein Issue im GitHub Repository oder kontaktieren Sie das Entwicklungsteam.

## 📚 Weitere Dokumentation

- [Prisma Documentation](https://www.prisma.io/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [HTL Spengergasse](https://spengergasse.at)
