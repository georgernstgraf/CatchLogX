# History

Append-only archive of superseded knowledge entries.
Each entry keeps its date, title, origin file, reason, and original text.

## 2026-10-18: Produktions-Upgrade-Tickets als erledigt geschlossen (Backlog-Triage)
- **Original**: `docs/ai/STATE.md` „Pending" — der Produktions-Upgrade-Pfad #137–#153 als offene Ticketliste (Audit, Adoptionsskript, Rehearsal, Cutover, Interim-Deploy, Read-only-Rolle …).
- **Superseded by**: Backlog-Triage am 2026-10-18 — geschlossen als erledigt/überholt: #133 (Fix `11bef36`, auf `dev`), #134 (Fix `3bb558a`, `migration-drift` grün), #137 (dispatch-only-Zustand erreicht), #138 (Audit-Run 39113184455), #139 (`lib/adoption.ts`, Idempotenz im Cutover bewiesen), #140 (Rehearsal-Run 39079039305), #141 (Cutover-Run 39113353435), #142 (Interim-Deploy-Run 39113591513), #152 (`clx_readonly`, Run 39117175848), #84 (überholt durch #115/#122), #105 (einmaliger Backlog-Sync). Belege in den jeweiligen Abschlusskommentaren.
- **Origin**: `docs/ai/STATE.md`, `docs/ai/HANDOFF.md`
- **Reason**: Tickets waren implementiert bzw. ihr Zweck erfüllt. Restaufgaben bleiben als eigene Posten offen: #143, #144, #145, #153, Smoke-Account-Restposten (#150), `clxadmin`-Rotation.

## 2026-10-17: Privates Datenrepo CatchLogX-Data angelegt (#125)
- Neues privates Schwesterrepo `georgernstgraf/CatchLogX-Data` mit dem Datenbestand aus `Bulk import.zip` (39 Dateien, 282,1 MiB, 9 Commits, inkrementell gepusht).
- Struktur 1:1 wie geliefert (`Bulk import/`), Scaffolding (`README.md`, `.gitignore`, `AGENTS.md`, `docs/ai/`).
- Einladungen an 7 Personen: `lenagraf` und `Fishknut` mit Commit-Rechten, die übrigen fünf (noch) mit Schreibrecht.
- Verweis im README dieses Repos (Commit `566cbc9`, `dev`).
- **Origin**: `docs/ai/ARCHITECTURE.md`, `docs/ai/DECISIONS.md`
- **Reason**: Neuer struktureller Bestandteil des Projekts; die Datenablage ist jetzt ein eigenes Repo.

## 2026-10-17: MinIO als Dateispeicher abgelöst (#131)
- **Original**: `DECISIONS.md` „MinIO for File Storage" (2026-04-27) — Dateien in MinIO (S3-kompatibler Container) statt lokalem Dateisystem oder DB; Tradeoff: zweite Infrastruktur-Abhängigkeit neben PostgreSQL. Ergänzend „Dev-Instanz selbstgebautes MinIO, mc aus apt" (2026-10-17) — MinIO-Server als aus Source gebautes Binary, `mc` aus dem Ubuntu-Paket.
- **Superceded by**: `DECISIONS.md` 2026-10-17 „PostgreSQL-Blobs statt MinIO (#131)".
- **Origin**: `docs/ai/DECISIONS.md`, `docs/ai/ARCHITECTURE.md`, `AGENTS.md`, `README.md`
- **Reason**: MinIO bot keine gemeinsame Transaktion mit der DB; der atomare Bulk-Import (#88) braucht Blobs in der Datenbank. `lib/minio.ts`, die Compose-Services `minio`/`minio-init`, die `minio`-Dependency und (auf der Dev-Instanz) `minio.service`/`mc` entfallen.

## 2026-10-17: Deploy mit integriertem Build im Restart (`catchlogx-update`) (#135)
- **Original** (`DECISIONS.md`, 2026-10-17, „Deploy-Dienst als systemd-User-Units mit integriertem Deploy"): Dev-Instanz als User-Unit `catchlogx.service` (`npm start`, Port 40873); jeder (Re)Start löste über `Wants`/`After` die Oneshot-Unit `catchlogx-update.service` aus, die `~/.config/catchlogx/deploy.sh` ausführte: `git pull --ff-only origin dev` → `npm ci` (nur bei geändertem `package-lock.json`) → `npx prisma migrate deploy` → `npm test` (Fehler nur als Warnung) → `npm run build` nur wenn sich HEAD verschoben hat. Dazu die passenden Abschnitte in `ARCHITECTURE.md` (Deployment Topology, Deploy-Paths) und `AGENTS.md` („`systemctl --user restart` ist der volle Deploy+Restart").
- **Superseded by** (`DECISIONS.md`, 2026-10-17): „SHA-gekeyte Standalone-Releases statt Build-im-Restart (#135, #123)".
- **Origin**: `docs/ai/DECISIONS.md`, `docs/ai/ARCHITECTURE.md`, `docs/ai/STATE.md`, `docs/ai/PITFALLS.md`, `AGENTS.md`
- **Reason**: Der HEAD-Vergleich „vor dem Pull / nach dem Pull" lieferte einen **veralteten Build** aus, wenn der Commit lokal bereits existierte (#133: Upload ohne Erfolgsrückmeldung, weil die App den alten Stand servierte), und ein `restart` baute immer mit. Jetzt: Artefakt pro SHA, Restart ohne Build, Rollback per Symlink.

## 2026-10-17: „Deploy to Test Server" (`manual.yml`) und `test.a19.at`-Reste entfernt (#136)
- **Original**: `.github/workflows/manual.yml` (Anzeigename „Deploy to Test Server") lief bei Push auf `master` auf `ubuntu-latest` und deployte per SSH nach `catchlogx.test.a19.at` (`cd ~/CatchLogX` → `git fetch origin master` → `git reset --hard` → `docker compose down && up -d --build`), gestützt auf die Secrets `TEST_SERVER_SSH_KEY`/`TEST_SERVER_HOST`/`TEST_SERVER_SSH_PORT`/`TEST_SERVER_USER`/`TEST_SERVER_PATH`. Dazu passend `docker-compose.yml`: `NEXTAUTH_URL: https://catchlogx.test.a19.at`. Tabellenzeile in `docs/ai/ARCHITECTURE.md` („Deploy paths").
- **Origin**: `.github/workflows/manual.yml`, `docker-compose.yml`, `docs/ai/ARCHITECTURE.md`
- **Reason**: Reste des vorigen Owners (das Repo wechselte den Besitzer, nicht nur den Namen); `catchlogx.test.a19.at` gehört nicht zu diesem Projekt. Entfernt: der Workflow, alle fünf `TEST_SERVER_*`-Repo-Secrets (darunter der **einzige SSH-Private-Key** im Secret Store), und `NEXTAUTH_URL` zeigt jetzt auf `http://localhost:3001` (lokale Compose-Dev-Instanz).

## 2026-10-29 (SUPERSEDED 2026-10-29, origin: DECISIONS.md, reason: Messung beim #171-Rollout): „`pg_stat_statements` ist nach einem Restart leer"
Ursprünglicher Satz (Tradeoff-Eintrag zu #169 am 2026-10-29): *„pg_stat_statements liegt im Shared Memory und ist nach einem Restart leer — die Historie ist dann nur noch der zuletzt gezogene Report."* Beim Rollout von #171 gemessen: `pg_stat_statements.save` ist per Default `on`, die Zähler werden beim **sauberen** Shutdown geschrieben und beim Start geladen — `tracked_shapes = 198` und unveränderter `stats_reset` nach `systemctl restart postgresql@16-main`. Ersetzt durch den korrigierten Satz in `DECISIONS.md` und den neuen `PITFALLS.md`-Eintrag (nur `pg_stat_statements_reset()`/`pg_stat_reset()` oder ein Crash leeren das Fenster).

## 2026-10-16: SQL guard keyword blocklist (from PITFALLS.md)
- **Reason superseded**: #121 removed the heuristic; the read-only role `clx_readonly` (whitelist) is now the boundary.
- **Original**: - `validateSQLQuery` (`services/queryService.ts`) is a keyword blocklist (whole-word match since #116), not a security boundary — it can't see through e.g. Postgres unicode-escaped identifiers. Real protection for the query UI would be a read-only DB role.

## 2026-10-30 (SUPERSEDED 2026-11-04, origin: HANDOFF.md / deploy/prod/postgres/README.md, reason: #121 Plan-Änderung durch Georg): Eigene Rolle `clx_query` für die SQL-Seite
- **Original**: Die SQL-Seite sollte als eigene Rolle `clx_query` laufen (Whitelist, `default_transaction_read_only = on`, `statement_timeout = 10s`), angelegt auf Hosts mit `deploy/prod/postgres/query-role.sh`, lokal mit `npm run db:query-role`; `clx_readonly` hätte breit bleiben und nur `QueryLog` per `AUTH_TABLES` ausschließen sollen. HANDOFF-Punkt 18 hieß „#121 Rollout `clx_query`".
- **Reason**: Georg (`0380c9b`, Kommentar in #121): ein Read-only-Account für Forschungsgruppe und SQL-Seite, `clx_readonly` ist jetzt selbst die Whitelist. `query-role.sh` gelöscht, Skript zu `scripts/create-readonly-role.ts` (`npm run db:readonly-role`) umgebaut. Entfallen sind dabei das Read-only-Default und das `statement_timeout` der Rolle.

## 2026-10-29 (SUPERSEDED 2026-11-09, origin: PITFALLS.md / AGENTS.md, reason: #189, beobachtet am 2026-11-06 auf `claw`): „Dev-VPS `claw` ist am öffentlichen SSH-Port nicht erreichbar, kein Checkout auf dem Host"
- **Original** (`PITFALLS.md`, Commit `28fd233`): - **The dev VPS `claw` is not reachable on the public SSH port** — `85.215.162.182:22` (`claw.graf.priv.at` / `catchlogx.graf.priv.at`) refuses connections while 443 and 5432 are open. The way in is the WireGuard/OpenVPN tunnel: `ssh claw` uses `Hostname 10.8.0.2`, `User georg` (`ssh clawc` is the same host as `catchlogx`), and `georg` has passwordless sudo. There is **no source checkout** on that host: the app is published by the self-hosted runner into `~/releases/<sha>` for the `catchlogx` user, so config files are copied there (`scp … claw:/tmp/`) or fetched from raw.githubusercontent.com.
- **Original** (`AGENTS.md` „Agent Sessions" und `PITFALLS.md`, Commit `613af36`): Host-Check mit `systemctl --user list-units | grep -i clx`.
- **Reason**: Port 22 ist nicht zu, sondern per Port-Knocking geschützt (Georg per Mail, 2026-11-06); nach dem Klopfen funktioniert der Login als `catchlogx` mit persönlichem Key (2026-11-06 durchgeführt). Auf dem Host liegt der Checkout `~/repos/georgernstgraf/CatchLogX`, aus dessen `.env` `catchlogx.service` seine Umgebung lädt (`systemctl --user cat catchlogx.service`). `grep -i clx` liefert auf `claw` eine leere Ausgabe, weil beide Units `catchlogx` im Namen tragen. Der Tunnelweg über `10.8.0.2` bleibt gültig und steht weiter im korrigierten `PITFALLS.md`-Eintrag.
