# Vor-Ort-Wartungstermin BOKU-Server (Martin) — 2026-10-18

On-site maintenance window at Martin Seebacher's desk machine (production instance,
`db push`-era, noch auf `dc2f1e4`). Zweck: datenerhaltender Cutover der
Produktionsdatenbank auf das migrationsgeführte Schema (#137–#150) plus die
Härtungsposten aus #122. Grundlage: `docs/ai/HANDOFF.md`, `docs/ai/STATE.md`,
Issue #122, #141.

## Attendees

- Georg (Betreuer, durchführt)
- Martin Seebacher (BOKU-Technik, vor Ort)

## Voraussetzungen (vor dem Cutover prüfen)

- [ ] Runner online: `gh api repos/georgernstgraf/CatchLogX/actions/runners --jq '.runners[] | "\(.name) \(.status)"'` — `catchlogx-server` muss `online` melden (geprüft 2026-10-18: online)
- [ ] Smoke-Account liegt bereit: `smoke-test` (ADMIN), angelegt + verifiziert am 2026-10-18 (Run 39110044494). Das Passwort liegt **nur** im Repo-Secret `PROD_SMOKE_PASSWORD` — nie in Doku, Issue oder Passwortmanager kopieren
- [ ] Martin informiert: die Produktion geht beim Cutover bewusst kurz offline

## Cutover-Sequenz (in diesem Fenster, in dieser Reihenfolge)

1. [ ] **Audit (read-only)**: `gh workflow run production-maintenance.yml --ref master -f job=audit -f keep_backups=5` — frisches, verifiziertes DB-Dump + MinIO-Export, Drift-Report, Zeilenzahlen; nimmt die Produktion nicht offline
2. [ ] **Cutover (#141)**: `gh workflow run production-maintenance.yml --ref master -f job=cutover -f confirm=ADOPT-PRODUCTION -f keep_backups=5`
   - Erwarteter Ablauf: `clx-web` wird retired (App offline) → frisches Dump + MinIO-Export → Adoption (Dry-Run → Apply → No-op-Re-Run) → Migrations-Buchhaltung + Drift-Check (muss leer sein) → Zeilenzahlen/Sessions erhalten → Checkout-Reset (alter Compose mit `db push` ist damit vom Rechner) → `docker compose up -d --build` → Health-Check (bis ~20 min, Build im Container) → Sign-in/Download-Smoke-Test mit `smoke-test`
   - Nach dem Lauf: die Step-Summary „Production state after the cutover" auswerten (Run-Link, Zeilenzahlen vor/nach, Blob-Report, Smoke-Ergebnis)
   - **Bei Fehlschlag**: die App bleibt bewusst gestoppt (nie halblebig). Ursache fixen und denselben Job erneut dispatchen (idempotent), **oder** zuerst das Pre-Cutover-Dump zurückspielen (`$CUTOVER_DEST/db.dump`, `pg_restore --clean --if-exists`), dann erneut dispatchen. Niemals den `db push`-Ära-Code gegen das adoptierte Schema laufen lassen (siehe `docs/ai/PITFALLS.md`)
3. [ ] **Interim-Deploy (#142)** — erst nach einem grünen Cutover: `gh workflow run production-deploy.yml --ref master -f ref=master` (der Adopted-Schema-Guard verweigert vorher den Dienst). Rollback: denselben Job mit `ref=<vorheriger master-Commit>` neu dispatchen

## Härtung aus #122 (vor Ort, nach dem Cutover)

4. [ ] Dokumentierten Wartungszugang sicherstellen (SSH-Key, von der OE gebilligt) statt verstecktem Tunnel
5. [ ] Backup-Status prüfen (Backup-Sets unter `~/catchlogx-backups/`, verifizierte Dumps)
6. [ ] Dev-Defaults rotieren: `clxadmin` (Postgres), `minioadmin` (MinIO — nur falls bis dahin noch gebraucht), `NEXTAUTH_SECRET`
7. [ ] Ports 5432/9000/9001 auf localhost/Docker-Netz beschränken
8. [ ] Veralteten Actions-Runner des Vorgänger-Teams entfernen
9. [ ] Zurückgelassenen MinIO-Container samt Volume entfernen (`catchlogx_clx_miniodata`)

## Nach dem Fenster

- [ ] Smoke-Account löschen (`DELETE FROM "User" WHERE username='smoke-test';`, kaskadiert auf die Sessions) **oder** `PROD_SMOKE_PASSWORD` rotieren und den `smoke-user`-Job erneut dispatchen (#150)
- [ ] Ergebnis des Cutover-Laufs in `docs/ai/STATE.md` nachziehen (#145), #141 schließen
- [ ] Anschließend (remote, code-seitig): Immutable-Release-Topologie + systemd-Unit für die Produktion (#143) und die gated Deploy-Pipeline (#144) — sie lösen den manuellen `production-deploy.yml`-Workflow ab (#137)

## Decisions

- Den Cutover nur in diesem Fenster dispatchen (die Produktion geht dabei bewusst kurz offline); der Job verweigert ohne den exakten Bestätigungstoken `ADOPT-PRODUCTION`
- Genau zwei Jobs dürfen auf die Produktion schreiben: `cutover` (#141) und `smoke-user` (#150) — beide in `production-maintenance.yml`, dispatch-only, ref-guarded auf `master`. Das ist eine Invariante, keine Zahl zum Erweitern
- Nach einem fehlgeschlagenen Cutover bleibt die App bewusst gestoppt — kein halblebiger Zustand; Rollback nur über das verifizierte Pre-Cutover-Dump, nie über den alten Container

## Action Items

- [ ] Cutover dispatchen und auswerten — Georg — in diesem Fenster (#141)
- [ ] Interim-Deploy nach grünem Cutover dispatchen — Georg — in diesem Fenster (#142)
- [ ] Härtungsposten 4–9 abarbeiten — Georg + Martin — vor Ort (#122)
- [ ] Smoke-Account löschen oder rotieren — Georg — nach dem Fenster (#150)
- [ ] Ergebnis in `docs/ai/STATE.md` nachziehen, #141 schließen — Georg — nach dem Lauf (#145)
