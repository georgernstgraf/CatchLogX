# Vor-Ort-Wartungstermin BOKU-Server (Martin) — 2026-10-18

On-site maintenance window at Martin Seebacher's desk machine (production instance).
Zweck: datenerhaltender Cutover der Produktionsdatenbank auf das migrationsgeführte
Schema (#137–#150), die Immutable-Release-Topologie (#143) und die Härtungsposten
aus #122. Grundlage: `docs/ai/HANDOFF.md`, `docs/ai/STATE.md`, Issue #122, #141, #143.

## Attendees

- Georg (Betreuer, durchführt)
- Martin Seebacher (BOKU-Technik, vor Ort)

## Voraussetzungen (vor dem Cutover prüfen)

- [x] Runner online: `catchlogx-server` meldete `online` (Label `boku`), geprüft 2026-10-18
- [x] Smoke-Account liegt bereit: `smoke-test` (ADMIN), angelegt + verifiziert am 2026-10-18 (Run 39110044494). Das Passwort liegt **nur** im Repo-Secret `PROD_SMOKE_PASSWORD` — nie in Doku, Issue oder Passwortmanager kopieren
- [x] Martin informiert: die Produktion geht beim Cutover bewusst kurz offline

## Cutover-Sequenz — **erledigt am 2026-10-18**

1. [x] **Audit (read-only)** — Run [39113184455](https://github.com/georgernstgraf/CatchLogX/actions/runs/39113184455): 5,6 M DB-Dump verifiziert, 21 MinIO-Objekte (54 M), `_prisma_migrations` **ABSENT** (db-push-Ära), Drift vorhanden; Zeilenzahlen `DummyFiles 1`, `Uploads 18`, `User 8`, `Session 13`
2. [x] **Cutover (#141)** — Run [39113353435](https://github.com/georgernstgraf/CatchLogX/actions/runs/39113353435) (3m44s, alle Schritte grün): Shape `legacy` → adoptiert; Backup-Set `/home/clxadmin/catchlogx-backups/cutover-20261018T085752Z` (5,6 M Dump + 21 Objekte); Adoption idempotent (2. Lauf `write 0 blob(s)`); `blobs=19 bytes=56337761`; `uploads unlinked=0`, `templates unlinked=0`, `mismatched size=0`; Zeilenzahlen und `Session 13 → 13` unverändert; Drift leer; Checkout `4b04e52`, kein `db push`; Health-Check ok; **Smoke-Test ok** (Sign-in, Session, Download `cmqjjxkrb000bn9x9fwb8kxdz`, 446652 Bytes)
3. [x] **Interim-Deploy (#142)** — Run [39113591513](https://github.com/georgernstgraf/CatchLogX/actions/runs/39113591513): Adopted-Schema-Guard passiert, deployter Commit `4b04e52`, Health ok

## Immutable-Release-Topologie (#143)

Repo-Code in `dev`/`master` (`1fa3bf5`). Ergebnisse:

- [x] `machine-report` (Run 39114763871): Ubuntu 26.04, glibc 2.43, genug Platz; **kein natives Node**; nodejs.org erreichbar; Port 3001 hält `clx-web` auf `0.0.0.0:3001` → Unit bindet ebenfalls 0.0.0.0; **der Runner ist ein SYSTEM-Service**, also keine logind-Session und kein `systemctl --user`
- [x] `release-topology` (Run 39115277532): verweigerte korrekt am User-Manager-Gate, kein Teilzustand. Fix: Jobs exportieren `XDG_RUNTIME_DIR`/`DBUS_SESSION_BUS_ADDRESS` und versuchen `sudo -n loginctl enable-linger` (scheitert — sudo braucht Passwort)
- [ ] **Vor Ort:** `sudo loginctl enable-linger clxadmin`, dann `release-topology` erneut (richtet Node v22.23.3, `/opt/CatchLogX/.env`, Unit ein — enabled, nicht gestartet)
- [ ] **Release-Deploy:** `gh workflow run production-deploy.yml --ref master -f ref=master` (Build im Job, Release publizieren, `clx-web` retiren, Unit restart, Health 3001)
- [ ] **Rollback einmal üben und dokumentieren:** Job mit dem vorherigen `master`-Commit, Health, zurück, Health
- [ ] Prüfen: genau eine Unit am Port, kein `clx-web` mehr; `ARCHITECTURE.md`/`STATE.md` nachziehen, #143 schließen

## Read-Only-Datenbankzugriff für die Forschung (R) — #152

Zweck: wissenschaftliche Mitarbeiter fahren Statistiken mit **R** direkt gegen die Produktions-DB. Der Port 5432 ist bereits auf allen Interfaces offen (Status quo); der Schutz ist die Rolle, nicht der Port.

- [x] **Dispatch** von `readonly-role` — Run [39117175848](https://github.com/georgernstgraf/CatchLogX/actions/runs/39117175848) grün: `clx_readonly` angelegt (SELECT nur auf Nicht-Auth-Tabellen, `CONNECTION LIMIT 20`), Passwort extern geprüft (falsches Passwort abgelehnt, Lesen ok, Schreiben und Auth-Tabellen verweigert), `READONLY_DB_PASSWORD` in `/opt/CatchLogX/.env`. Zwei Bugs vorab gefunden und gefixt: die Auth-Tabelle heißt `PasswordResets` (nicht `PasswordReset`), und `FishCatch` ist per `@@map` → `fish_catches`
- [ ] **Weitergabe** an die Forschungsgruppe out-of-band (oder später über #153)
- **R-Beispiel für die Handreichung:**
  ```r
  library(DBI)
  con <- dbConnect(RPostgres::Postgres(), host = "<host>", port = 5432,
                   dbname = "clx", user = "clx_readonly",
                   password = "<aus der Handreichung>")
  dbGetQuery(con, 'SELECT count(*) FROM "fish_catches"')
  ```
- **Rotation:** `readonly-role` erneut dispatchen (schreibt neues Passwort in Role + `.env`) — kein Rebuild.
- ⚠️ **`clxadmin` hat weiterhin das Dev-Default-Passwort** am selben offenen Port → Rotation jetzt dringlich, aber **erst nach** dem Unit-Cutover (#143), weil der laufende `clx-web`-Container es in seiner Compose-Umgebung hat. Rezept danach: `ALTER ROLE clxadmin PASSWORD '…'` + `DATABASE_URL` in `/opt/CatchLogX/.env` anpassen + `systemctl --user restart catchlogx.service`

## Härtung aus #122 (vor Ort)

4. [ ] Dokumentierten Wartungszugang sicherstellen (SSH-Key, von der OE gebilligt) statt verstecktem Tunnel
5. [ ] Backup-Status prüfen (Backup-Sets unter `~/catchlogx-backups/`, verifizierte Dumps)
6. [ ] **Dev-Defaults rotieren (niedrige Priorität, #122):** `clxadmin` (Postgres), `minioadmin` (MinIO — entfällt nach der Decommission), `NEXTAUTH_SECRET`. Rezept ohne Rebuild: `/opt/CatchLogX/.env` anpassen (Postgres-Passwort zusätzlich im `clx-postgres`-Container setzen) → `systemctl --user restart catchlogx.service`
7. [ ] Ports 9000/9001 beschränken (MinIO — entfällt mit der Decommission); **5432 bleibt bewusst offen** (Read-only-for-Role, #152)
8. [ ] Veralteten Actions-Runner des Vorgänger-Teams (`catchlogx-server`) **nicht in diesem Fenster ersetzen** — er ist der einzige Prod-Pfad; Entscheidung dokumentiert, Neuanlage als eigener Posten
9. [ ] Zurückgelassenen MinIO-Container samt Volume entfernen (`catchlogx_clx_miniodata`)

## Nach dem Fenster

- [ ] Smoke-Account löschen (`DELETE FROM "User" WHERE username='smoke-test';`, kaskadiert auf die Sessions) **oder** `PROD_SMOKE_PASSWORD` rotieren und den `smoke-user`-Job erneut dispatchen (#150)
- [ ] Ergebnis der Läufe in `docs/ai/STATE.md` nachziehen (#145), #141/#142/#143 schließen
- [ ] Anschließend (code-seitig): gated Deploy-Pipeline (#144) — Prod-Deploy-Job in `test.yml` (gated auf `test` + `migration-drift`, eigener Concurrency-Group, `master`-Trigger), danach `production-deploy.yml` und die einmaligen Maintenance-Jobs entfernen (#137)

## Decisions

- Den Cutover nur im Vor-Ort-Fenster dispatchen (Produktion bewusst kurz offline); der Job verweigert ohne den exakten Bestätigungstoken `ADOPT-PRODUCTION`
- Genau **drei** Jobs dürfen auf die Produktion schreiben: `cutover` (#141), `smoke-user` (#150) und `release-topology` (#143) — alle in `production-maintenance.yml`, dispatch-only, ref-guarded auf `master`, mit `confirm=ADOPT-PRODUCTION`. Das ist eine Invariante, keine Zahl zum Erweitern
- Die Produktion läuft ab #143 als **systemd-User-Unit** (`node ~/current/server.js`) statt als Container; nur die Datenbank bleibt Container. `docker-compose.prod.yml` deaktiviert den `app`-Service per Compose-Profil `interim-container`, damit kein `compose up` die App zurückholt
- Der Postgres-Port 5432 bleibt **bewusst auf allen Interfaces offen**; der Zugriffsschutz ist die read-only-Rolle `clx_readonly` (#152), nicht der Port. Das geteilte Passwort liegt nur in `/opt/CatchLogX/.env` (mode 600) und geht out-of-band — bzw. später über die In-App-Seite (#153) an alle eingeloggten Nutzer — an die Forschungsgruppe
- Secret-Rotation: die Smoke-Account-Rotation bleibt niedrig priorisiert; die **`clxadmin`-Rotation wird durch den offenen Port 5432 dringlich**, aber erst nach dem Unit-Cutover (#143) möglich (Container hat das Passwort gebacken)
- Nach einem fehlgeschlagenen Cutover bleibt die App bewusst gestoppt — kein halblebiger Zustand; Rollback nur über das verifizierte Pre-Cutover-Dump, nie über den alten Container

## Action Items

- [x] Cutover dispatchen und auswerten — Georg — 2026-10-18 (#141)
- [x] Interim-Deploy dispatchen — Georg — 2026-10-18 (#142)
- [x] `machine-report` dispatchten und auswerten — Georg — 2026-10-18 (#143)
- [ ] `sudo loginctl enable-linger clxadmin` vor Ort ausführen — Georg/Martin — in diesem Fenster (#143)
- [ ] `release-topology` erneut + Release-Deploy dispatchen, Rollback üben — Georg — in diesem Fenster (#143)
- [x] `readonly-role` dispatchen (Read-only-Zugang für R, #152) — Georg — 2026-10-18 (#152)
- [ ] Passwort `clx_readonly` out-of-band an die Forschungsgruppe weitergeben — Georg/Lena — nach diesem Fenster (#152)
- [ ] `clxadmin`-Passwort rotieren (erst nach dem Unit-Cutover) — Georg — in diesem Fenster (#122)
- [ ] Härtungsposten 4–7, 9 abarbeiten — Georg + Martin — vor Ort (#122)
- [ ] Smoke-Account löschen oder rotieren — Georg — nach dem Fenster (#150)
- [ ] Ergebnis in `docs/ai/STATE.md` nachziehen, #141/#142/#143 schließen — Georg — nach dem Lauf (#145)
