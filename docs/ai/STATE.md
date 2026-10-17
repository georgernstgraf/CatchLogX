# Project State

Current status as of 2026-10-17.

## Current Focus
Zwei Stränge laufen parallel:

1. **Datenablage getrennt** (#125) — die Befischungsdaten der BOKU liegen seit 2026-10-17 im privaten Schwesterrepo `georgernstgraf/CatchLogX-Data` (39 Dateien, 282,1 MiB). Dieses Repo hier ist public und enthält nur noch Anwendungscode. Offen: die read-only-Rollen der fünf Diplom-User (`CatchLogX-Data#2`).
2. **Infrastruktur/Vor-Ort** — zweiter Self-hosted-Runner auf dem VPS (#123) und der Wartungstermin am BOKU-Server (#122).

**Trunk-based development on `dev`** — keine Feature-Branches; `git pull --ff-only origin dev` beim Sessionstart. `master` ist Produktion (protected: PR + 1 Approval, auch für Admins), Merges kommen nur aus `dev`. Der Pre-Push-Gate (`.githooks/pre-push`, Lint + Typecheck + Test) schützt `dev`; **CI (`.github/workflows/test.yml`) ist die Quelle der Wahrheit**.

Kickoff 2026-09-19 (siehe `docs/meetings/2026-09-19-kickoff.md`, Protokoll + Aufgaben in #113). Rollen: Dominik (Backend-Lead), Rodion (Datenbank), Armin + Alex (Frontend), Jakob (Testing). Fachkontakt: Lena (BOKU Hydrobiologie), Technik: Martin Seebacher (`@Fishknut`). Wöchentlicher Zoom am Samstag.

## Production & Infrastructure (BOKU)
- Produktivserver: Desktop-Klasse auf Martin Seebachers Schreibtisch (Institut-IT, OE-Level) im BOKUnet, produktiv seit Juni 2026, nur informell per Mail akkreditiert (#115)
- Allgemeine (depersonalisierte) Wartungsanfrage an `boku-it@boku.ac.at` ist raus (Fassung in `docs/boku-it-auskunft-mail.md`); Antwort offen
- Vor-Ort-Wartungstermin durch Georg bei Martin geplant — Checkliste in #122 (Backup, dokumentierter SSH-Zugang statt verstecktem Tunnel, Secret-Rotation, alter Runner entfernen)
- VPS-Instanz `catchlogx.graf.priv.at` existiert (Georgs VPS); Studierende deployen dort eine Kopie; zweiter Self-hosted Actions-Runner geplant (#123)
- **Dev-Instanz live seit 2026-10-17** (#126): komplett unter System-User `catchlogx`, rootless Docker (nur PostgreSQL 16, `127.0.0.1:5432`), MinIO als aus Source gebautes Binary (`minio.service`, `127.0.0.1:9000/9001`), App als Production-Build (`clx-app.service`, `127.0.0.1:40873`) hinter nginx/TLS auf `https://catchlogx.graf.priv.at`. Dev-User `admin`/`admin` (nur Instanz, nie Prod). Setup-Details: `ARCHITECTURE.md` (Deployment Topology), DECISIONS-Eintrag 2026-10-17.
- **Demo-Datensatz geseedet** (#127): `npm run seed:demo` legt idempotent 2 Dev-User, 125 Fischarten, 10 Standorte, 10 Samplings, 50 Fänge sowie die Vorlagedateien (`import-template.xlsx`/`.csv`) als sichtbare Template-Files an. Auf der Dev-Instanz verifiziert (zweiter Lauf ohne Duplikate).
- **„Dummy" → „Template" umbenannt** (#128): Der Begriff „dummy file" war irreführend — die Datei ist eine direkt befüllbare Vorlage (früher „Eingabemaske"). Umbenannt in Code, Prisma-Modell (`ALTER TABLE "DummyFiles" RENAME TO "TemplateFiles"`, Migration liegt bei), API-Routen (`/api/upload/template-file`), UI und MinIO-Präfix (`CatchLogX/template_files`; alte Objekte unter `dummy_files/` bleiben über ihre gespeicherten Object-Keys abrufbar). Kanonischer Begriff: **template** (deutsch **Vorlage**) — „dummy" nicht mehr verwenden.

## Completed (this cycle)
- [x] Privates Datenrepo `CatchLogX-Data` angelegt, Daten übernommen, im README verlinkt (#125)
- [x] Custom cookie-based session auth (sign-in, session, logout)
- [x] Admin panel with user CRUD, upload approval/rejection, file downloads
- [x] Excel upload with validation (schema, PIT tag, cross-file checks)
- [x] SQL query interface with execution, save/load/delete, CSV export, preset queries
- [x] Leaflet map component with marker support
- [x] MinIO file storage (uploads + template files)
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
- [ ] `CatchLogX-Data#2`: read-only-Rollen für die fünf Diplom-User nach dem Accept setzen (nur über die Web-UI möglich, siehe `PITFALLS.md`)
- [ ] Database migrations are not current — `prisma db push` is used instead of `prisma migrate dev`
- [ ] NextAuth v4 is configured but not integrated with the custom session system
- [ ] Fish search component was removed (issue #60)
- [ ] 26 Dependabot alerts incl. 4 critical (see #109)
- [ ] BOKU-IT answer to the maintenance inquiry pending (see #115)

## Blockers
None.

## Next Session Suggestion
`CatchLogX-Data#2` ist schnell erledigt (Web-UI, sobald die Einladungen angenommen sind). Danach: Vor-Ort-Vorbereitung (#122) und VPS-Runner (#123) sind die aktiven Infrastruktur-Stränge; code-seitig echte Prisma-Migrationen statt `prisma db push` und Route-Handler-/Komponententests (jsdom + Testing Library).
