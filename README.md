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

- **Next.js 15.2.2** - React Framework mit App Router
- **React 19** - UI Library
- **TypeScript** - Type-Safe JavaScript
- **Tailwind CSS 4** - Utility-First CSS Framework
- **Lucide React** - Icon Library

### Backend

- **Next.js API Routes** - Server-Side Logic
- **Prisma** - Database ORM und Migration Tool
- **SQLite** - Entwicklungsdatenbank
- **bcrypt** - Passwort-Hashing
- **NextAuth.js** - Authentifizierung

### Development Tools

- **ESLint** - Code Linting
- **TypeScript** - Static Type Checking
- **Prisma Studio** - Database GUI

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
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── auth/          # Authentifizierung
│   │   └── query/         # SQL-Abfragen
│   ├── login/             # Login-Seite
│   ├── upload/            # Upload-Seite
│   └── forgot-password/   # Passwort-Reset
├── components/            # React Komponenten
│   ├── AuthProvider.tsx   # Authentifizierung Context
│   ├── DashboardComponent.tsx
│   ├── LoginForm.jsx
│   ├── SqlQueryComponent.tsx
│   └── UploadPageComponent.tsx
├── lib/                   # Utility Functions
│   ├── auth.ts           # Auth-Konfiguration
│   ├── prisma.ts         # Prisma Client
│   └── session.ts        # Session Management
├── prisma/               # Datenbank
│   ├── schema.prisma     # DB Schema
│   └── migrations/       # DB Migrationen
├── scripts/              # Utility Scripts
│   ├── create-user.ts    # Benutzer erstellen
│   └── insert-*.ts      # Daten-Import Scripts
└── samples/              # Beispieldaten
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

# Admin-Benutzer erstellen
npm run create-user
```

## 🤝 Mitarbeit (Trunk-Based)

Gearbeitet wird direkt auf `dev` (`master` ist Produktion und bekommt nur PRs aus `dev`).
Jeder Push auf `dev` läuft lokal durch Lint + Tests (Pre-push Hook) — bei Rot bricht der Push ab.
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

Entwickelt von Schülern der HTL Spengergasse als Abschlussprojekt:

- Arman (Team Lead & Backend Developer)
- Maxima (Vice Team Lead & Software Security Engineer)
- Burak (Database Designer)
- Tadeas (Frontend Developer & UI/UX)

## 🤝 Auftraggeber

**Universität für Bodenkultur Wien (BOKU)**
Abteilung für Hydrobiologie
Institut für Wasserwirtschaft, Hydrologie und konstruktiven Wasserbau

## 📄 Lizenz

Dieses Projekt wurde für die BOKU Wien entwickelt und dient ausschließlich akademischen und wissenschaftlichen Zwecken.

## 🐛 Bug Reports & Feature Requests

Bei Problemen oder Verbesserungsvorschlägen erstellen Sie bitte ein Issue im GitHub Repository oder kontaktieren Sie das Entwicklungsteam.

## 📚 Weitere Dokumentation

- [Prisma Documentation](https://www.prisma.io/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [HTL Spengergasse](https://spengergasse.at)
