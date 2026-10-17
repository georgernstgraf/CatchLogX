# Project State

Current status as of 2026-10-18.

## Current Focus
Drei Stränge laufen parallel:

1. **Datenablage getrennt** (#125) — die Befischungsdaten der BOKU liegen seit 2026-10-17 im privaten Schwesterrepo `georgernstgraf/CatchLogX-Data` (39 Dateien, 282,1 MiB). Dieses Repo hier ist public und enthält nur noch Anwendungscode. Offen: die read-only-Rollen der fünf Diplom-User (`CatchLogX-Data#2`).
2. **Infrastruktur/Vor-Ort** — zweiter Self-hosted-Runner auf dem VPS (#123) und der Wartungstermin am BOKU-Server (#122).
3. **Produktions-Upgrade** (#137–#145) — Martins Maschine läuft noch auf `dc2f1e4` (MinIO + `prisma db push`). Ein **datenerhaltender** Pfad bringt sie über den `boku`-Runner auf das migrationsgeführte Schema, ohne Sessions, Password-Resets, Upload-Metadaten oder Templates zu verlieren (die MinIO-Objekte der Produktion werden dabei zu `FileBlob`-Rows): Audit + Backup (#138) → Adoptionsskript (#139) → Rehearsal gegen eine Prod-Kopie (#140) → Cutover in einem Job (#141) → immutable Release + systemd-Unit (#143) → gated Deploy (#144). Die ersten drei Schritte sind gemergt (PRs #146–#148 auf `master`) und damit wirksam: Der Audit (#138) lief grün, das Adoptionsskript (#139) ist fertig, und die Generalprobe (#140) lief grün gegen eine echte Kopie der Produktionsdatenbank (Run 39079039305: 19 Blobs / 56.337.761 Bytes, 464.654 Fänge, 18 Uploads, 1 Template, 7 User, 13 Sessions — alle Zeilenzahlen vor/nach der Adoption identisch). Der Cutover-Job (#141) und der Interim-Deploy (#142) sind gebaut und per Fast-Forward auf `master` (dank `enforce_admins: false` ohne zweite Approval); der Cutover wartet nur noch auf das Vor-Ort-Fenster (#122), der Interim-Deploy auf den gelaufenen Cutover. Der Interim-Deploy (`production-deploy.yml` + `docker-compose.prod.yml`) verweigert als ersten Maschinen-Zugriff den Dienst, solange Prod noch auf dem `db push`-Schema ist (**Adopted-Schema-Guard**), baut einmalig im Job statt im Container und dokumentiert den Rollback (Job mit `ref=<vorheriger master-Commit>` neu dispatchen). Offen: #141 (Dispatch im Vor-Ort-Fenster #122), #142 (ein Lauf nach dem Cutover), #143/#144 (Release-/Deploy-Topologie), #145 (Nachziehen des echten Lauf-Ergebnisses).

**Trunk-based development on `dev`** — keine Feature-Branches; `git pull --ff-only origin dev` beim Sessionstart. `master` ist Produktion (1 Approval gefordert, aber `enforce_admins` ist **aus**: der Owner kann `dev` per Fast-Forward direkt auf `master` schieben — so sind #141/#142 gelandet), Merges kommen nur aus `dev`. Der Pre-Push-Gate (`.githooks/pre-push`, Lint + Typecheck + Test) schützt `dev`; **CI (`.github/workflows/test.yml`) ist die Quelle der Wahrheit**.

Kickoff 2026-09-19 (siehe `docs/meetings/2026-09-19-kickoff.md`, Protokoll + Aufgaben in #113). Rollen: Dominik (Backend-Lead), Rodion (Datenbank), Armin + Alex (Frontend), Jakob (Testing). Fachkontakt: Lena (BOKU Hydrobiologie), Technik: Martin Seebacher (`@Fishknut`). Wöchentlicher Zoom am Samstag.

## Production & Infrastructure (BOKU)
- Produktivserver: Desktop-Klasse auf Martin Seebachers Schreibtisch (Institut-IT, OE-Level) im BOKUnet, produktiv seit Juni 2026, nur informell per Mail akkreditiert (#115)
- Allgemeine (depersonalisierte) Wartungsanfrage an `boku-it@boku.ac.at` ist raus (Fassung in `docs/boku-it-auskunft-mail.md`); Antwort offen
- Vor-Ort-Wartungstermin durch Georg bei Martin geplant — Checkliste in #122 (Backup, dokumentierter SSH-Zugang statt verstecktem Tunnel, Secret-Rotation, alter Runner entfernen)
- **Topologie-Umstellung im Vor-Ort-Fenster (#122)** — Zusatzposten zur #122-Checkliste, hier im Repo gehalten (das Issue selbst bleibt unverändert): den datenerhaltenden Cutover (#141) innerhalb des Fensters dispatchten (Produktion geht dabei bewusst kurz offline); danach die Immutable-Release-Topologie + systemd-User-Unit umstellen (#143); den zurückgelassenen MinIO-Container samt Volume (`catchlogx_clx_miniodata`) und den veralteten Actions-Runner des Vorgänger-Teams entfernen; die Dev-Defaults rotieren (`clxadmin`, `minioadmin`, `NEXTAUTH_SECRET`)
- VPS-Instanz `catchlogx.graf.priv.at` existiert (Georgs VPS); Studierende deployen dort eine Kopie; zweiter Self-hosted Actions-Runner geplant (#123)
- **Dev-Instanz live seit 2026-10-17** (#126): komplett unter System-User `catchlogx`, rootless Docker (nur PostgreSQL 16, `127.0.0.1:5432`), App als **immutable Standalone-Release** (`catchlogx.service` führt `node ~/current/server.js` aus, `~/current` → `~/releases/<sha>/`, `127.0.0.1:40873`) hinter nginx/TLS auf `https://catchlogx.graf.priv.at`. Dev-User `admin`/`admin` (nur Instanz, nie Prod). Setup-Details: `ARCHITECTURE.md` (Deployment Topology), DECISIONS-Eintrag 2026-10-17.
- **Deploy-Pipeline auf der VPS** (#135, #123): self-hosted Runner `actions.runner.catchlogx-vps.service` (Labels `self-hosted, Linux, X64, vps`) läuft als User-Service unter `catchlogx` (Linger aktiv), damit Jobs `systemctl --user` erreichen. Der `deploy`-Job in `test.yml` baut bei Push auf `dev`, veröffentlicht `~/releases/<sha>` via `scripts/publish-release.sh`, führt `prisma migrate deploy` aus, restartet den Service und prüft einen Health-Check. `catchlogx-update.service` + `~/.config/catchlogx/deploy.sh` sind entfernt; ein Restart baut nicht mehr (~2 s).
- **Migrations-History repariert** (#134): Die #131-Migration (`replace_minio_with_file_blobs`) war *vor* der #129-Baseline datiert, wodurch der CI-Job `migration-drift` auf leerer DB scheiterte (ALTER auf noch nicht existierende Tabellen). Umbenannt auf `20261017200000_replace_minio_with_file_blobs`, Dev-DB-Buchhaltung per `migrate resolve --applied` nachgezogen; Replay landet exakt auf `schema.prisma`. CI wieder grün.
- **Runner-Routing festgelegt und `test.a19.at`-Reste entfernt** (#136): Beide self-hosted Runner tragen jetzt ein eigenes Custom-Label — `catchlogx-vps` → `vps` (baut `dev`), `catchlogx-server` (Martins Rechner) → `boku` (baut `master`, `production-deploy.yml` entsprechend gepinnt). Da `runs-on` nur über Labels routet, ist die Branch-Trennung die Kombination aus Branch-Trigger/-Guard und Label. Entfernt: `manual.yml` (SSH-Deploy auf den alten Testserver `catchlogx.test.a19.at`) und alle fünf `TEST_SERVER_*`-Secrets (Secret Store ist leer); `NEXTAUTH_URL` in `docker-compose.yml` zeigt auf `http://localhost:3001`.
- **Demo-Datensatz geseedet** (#127): `npm run seed:demo` legt idempotent 2 Dev-User, 125 Fischarten, 10 Standorte, 10 Samplings, 50 Fänge sowie die Vorlagedateien (`import-template.xlsx`/`.csv`) als sichtbare Template-Files an. Auf der Dev-Instanz verifiziert (zweiter Lauf ohne Duplikate).
- **„Dummy" → „Template" umbenannt** (#128): Der Begriff „dummy file" war irreführend — die Datei ist eine direkt befüllbare Vorlage (früher „Eingabemaske"). Umbenannt in Code, Prisma-Modell (`TemplateFiles`; die Umbenennung steckt jetzt in der Baseline `20261017190000_init`), API-Routen (`/api/upload/template-file`) und UI. Kanonischer Begriff: **template** (deutsch **Vorlage**) — „dummy" nicht mehr verwenden.
- **Migration-only-Workflow etabliert** (#129): Die Migrations-History log bisher (`UserRoles`-Enum nie migriert); eine einzige Baseline `20261017190000_init` ist jetzt die Schema-Wahrheit, `db push` ist aus allen Deploy-Pfaden verbannt, CI prüft Drift (`migration-drift`-Job), Shadow-DB `clx_shadow` für `migrate dev`. **Dev-DB aus der Baseline neu aufgebaut** (nur Seed-Daten). Die BOKU-Prod-DB wird **nicht** neu aufgebaut: die Adoption (#139) erhält alle Daten — Sessions, Password-Resets, Upload-Metadaten — und wandelt die 19 MinIO-Objekte (56.337.761 Bytes) in `FileBlob`-Rows um; die Produktion wird migrationsgeführt, sobald der Cutover (#141) im Vor-Ort-Fenster (#122) dispatcht ist (vorher ein verifiziertes `pg_dump`).

## Completed (this cycle)
- [x] Privates Datenrepo `CatchLogX-Data` angelegt, Daten übernommen, im README verlinkt (#125)
- [x] Custom cookie-based session auth (sign-in, session, logout)
- [x] Admin panel with user CRUD, upload approval/rejection, file downloads
- [x] Excel upload with validation (schema, PIT tag, cross-file checks)
- [x] SQL query interface with execution, save/load/delete, CSV export, preset queries
- [x] Leaflet map component with marker support
- [x] Bulk-Excel-Upload (#88): 1..N Dateien, **alles-oder-nichts** (eine Transaktion), Upload-Report pro Datei (Spalte/Wert/Meldung), Fehler-ZIP mit den annotierten Dateien (in-memory, nicht persistiert)
- [x] PostgreSQL-Blobs statt MinIO: Uploads + Vorlagen als `FileBlob` in der DB, MinIO aus Code/Compose/Dev-Instanz entfernt (#131)
- [x] PostgreSQL migration (from SQLite)
- [x] Dark mode support
- [x] Password reset flow (email via nodemailer)
- [x] First-login password change
- [x] Service layer pattern (all API routes delegate to services/)
- [x] PIT tag fields (pitDec, pitHex, recapture) on FishCatch
- [x] Language switched to English
- [x] Docker Compose for full stack (PostgreSQL + app)
- [x] AGENTS.md + docs/ai/ knowledge files created

## Pending
- [ ] Produktions-Upgrade (#137–#145): Audit (#138), Adoptionsskript (#139) und Rehearsal (#140) sind auf `master`; der Cutover-Job (#141) und der Interim-Deploy (#142) liegen auf `dev` und brauchen den `dev`→`master`-Merge (Default-Branch); der Cutover wartet dann auf das Vor-Ort-Fenster (#122), danach #143 (Immutable-Release), #144 (gated Deploy) und #145 (Adoptions-Dokumentation)
- [ ] `CatchLogX-Data#2`: read-only-Rollen für die fünf Diplom-User nach dem Accept setzen (nur über die Web-UI möglich, siehe `PITFALLS.md`)
- [x] Migration-only-Schema-Workflow etabliert (#129): eine Baseline `20261017190000_init` aus `schema.prisma`, `db push` aus allen Deploy-Pfaden verbannt, CI-Drift-Gate + Shadow-DB `clx_shadow`
- [ ] NextAuth v4 is configured but not integrated with the custom session system
- [ ] Fish search component was removed (issue #60)
- [ ] 26 Dependabot alerts incl. 4 critical (see #109)
- [ ] BOKU-IT answer to the maintenance inquiry pending (see #115)

## Blockers
None.

## Next Session Suggestion
`CatchLogX-Data#2` ist schnell erledigt (Web-UI, sobald die Einladungen angenommen sind). Danach: Vor-Ort-Vorbereitung (#122) mit dem datenerhaltenden Cutover (#141) und VPS-Runner (#123) sind die aktiven Infrastruktur-Stränge; code-seitig Route-Handler-/Komponententests (jsdom + Testing Library).
