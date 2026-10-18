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

## Härtung aus #122 (vor Ort)

4. [ ] Dokumentierten Wartungszugang sicherstellen (SSH-Key, von der OE gebilligt) statt verstecktem Tunnel
5. [ ] Backup-Status prüfen (Backup-Sets unter `~/catchlogx-backups/`, verifizierte Dumps)
6. [ ] **Dev-Defaults rotieren (niedrige Priorität, #122):** `clxadmin` (Postgres), `minioadmin` (MinIO — entfällt nach der Decommission), `NEXTAUTH_SECRET`. Rezept ohne Rebuild: `/opt/CatchLogX/.env` anpassen (Postgres-Passwort zusätzlich im `clx-postgres`-Container setzen) → `systemctl --user restart catchlogx.service`
7. [ ] Ports 5432/9000/9001 auf localhost/Docker-Netz beschränken
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
- Secret-Rotation ist bewusst niedrig priorisiert und blockiert die Topologie-Umstellung nicht
- Nach einem fehlgeschlagenen Cutover bleibt die App bewusst gestoppt — kein halblebiger Zustand; Rollback nur über das verifizierte Pre-Cutover-Dump, nie über den alten Container

## Action Items

- [x] Cutover dispatchen und auswerten — Georg — 2026-10-18 (#141)
- [x] Interim-Deploy dispatchen — Georg — 2026-10-18 (#142)
- [x] `machine-report` dispatchten und auswerten — Georg — 2026-10-18 (#143)
- [ ] `sudo loginctl enable-linger clxadmin` vor Ort ausführen — Georg/Martin — in diesem Fenster (#143)
- [ ] `release-topology` erneut + Release-Deploy dispatchen, Rollback üben — Georg — in diesem Fenster (#143)
- [ ] Härtungsposten 4–7, 9 abarbeiten — Georg + Martin — vor Ort (#122)
- [ ] Smoke-Account löschen oder rotieren — Georg — nach dem Fenster (#150)
- [ ] Ergebnis in `docs/ai/STATE.md` nachziehen, #141/#142/#143 schließen — Georg — nach dem Lauf (#145)
