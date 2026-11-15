---
type: Handoff
title: Handoff
description: Offene Aufgaben fuer die naechste Session.
tags: [catchlogx, handoff]
generated: { by: opencode/knowledge-persistence, at: 2026-11-15T12:53:11Z }
status: stable
---

# Handoff

Offene Aufgaben für die nächste Session.

**Stand 2026-11-15 (Release, Post-Cutover-Backup, Dev-Reseed, #204):** `dev`
per PR #215 nach `master` gemerged (`9eefb21`), `master` danach per Fast-Forward
zurück auf `dev` (beide zeigen jetzt `788be5b` bzw. dessen Merge-Basis).
Produktion wurde per `workflow_dispatch` auf **`9eefb21`** deployt (app-seitig
ein No-op: der Merge brachte nur Doku und `scripts/data/`), `master` steht auf
**`788be5b`** — der Diff `9eefb21..788be5b` ist ausschließlich
`deploy/prod/backup/` + `docs/ai/PITFALLS.md` und wurde deshalb **nicht** nach
Prod deployt; dort läuft `9eefb21`, gesund, 0 offene Migrationen.
**Backup-Befund (kritisch, behoben):** der erste Post-Cutover-Lauf starb nach
2 s an `FEHLER: Zeilen zählen fehlgeschlagen: Uploads` — `import_hard_delete`
hat die Tabelle gedroppt, `backup.sh` zählt sie in einer festen Liste und
bricht beim ersten Fehlschlag ab. Damit war **seit dem Cutover kein Backup
möglich**, der 02:30-Timer wäre heute Nacht genauso gescheitert (Signal nur in
`/var/mail/root`). Fix #216 (`Imports` statt `Uploads`), auf Prod installiert,
Lauf grün. **Erster Post-Cutover-Satz `20261115T124937Z`** (19 MB, 104
Dump-Einträge): 128 594 Fänge / 1 282 Samplings / 1 095 Sites / 165 Arten /
9 Imports / 9 User / 3 Templates / 12 Blobs (21 321 722 Bytes), Offsite auf
`claw` mit stimmiger Prüfsumme; das Pre-Cutover-Nachtarchiv
`20261115T023818Z.tar.zst` (55,9 MB) liegt weiterhin auf beiden Hosts, ein
fehlgeschlagener Teilsatz (`20261115T124714Z`) wurde entfernt.
**Dev ist neu geseedet:** `~/catchlogx-dev-restore.sh 20261115T124937Z.tar.zst`
als User `catchlogx` (kein sudo, kein root) — Dev trägt jetzt **die
Produktionsdaten** (128 594 / 1 282 / 1 095 / 165 / 9 Imports / 12 Blobs),
7 Migrationen ohne offene, `clx_readonly` wieder auf der Vier-Tabellen-Whitelist,
App 200 auf `:40873` und öffentlich, `clx_prev` nach grünem Health-Check
gedroppt. Damit ist der Dev-Stand **kein leerer Startzustand mehr**; die
Arten-Session mit Lena kann auf Dev gegen echte Prod-Daten laufen (Block unten).

**Stand 2026-11-15 (Cutover auf Produktion gelaufen, #200/#204):** Produktion
ist neu aufgebaut: **128 594 Fänge statt 464 654**, 9 der 13 Dateien live
(1 282 Samplings, 1 095 Sites, 165 Arten, 9 Importe, 9 User, 3 Templates,
2 Queries), Release `d9ac764`, `clx_readonly` verifiziert, `QUERY_DATABASE_URL`
erstmals gesetzt und die SQL-Seite liefert die Dev-Zahlen. Ablauf, Zahlen und
vier Abweichungen vom Runbook in `deploy/prod/cutover/README.md`, „Phase 2 —
result"; Rollback liegt bereit (`think:~/backups/pre-cutover-20261115T113930Z.dump`
+ Release `1266a87`). **Nächster Schritt: die Arten-Session mit Lena** — 18 Zellen
in 4 Dateien (`2026_D` 2 × `Proterorhinus marmoratus` → `Proterorhinus
semilunaris` in den Excel-Zeilen 6227/7330, 16 × `Salvelinus fontinalis ×
Salvelinus umbla` in `E_F`/`I`/`S`, Zielname offen). Danach die vier Dateien als
**reguläre Uploads** (kein Fenster, `import-deliveries.sh … D E_F I S`), Gate
**183 855**. Ausdrücklich **nicht** mehr nötig: ein `List`-Blatt für `2026_D`
(#213 hat die Strukturregel aus #80 abgelöst). Alles andere (M #206, Juni-23
#207) bleibt danach offen wie gehabt.

**Stand 2026-11-15 (Route C durchgespielt, #210):** Der Cutover startet jetzt
auf einer **gewipeten Prod-Kopie** statt auf einer leeren DB — User, Templates
und gespeicherte SQL-Queries bleiben damit erhalten, Phase-2-Schritt 5 des
Runbooks ist gestrichen. Auf Dev belegt (Details: `deploy/prod/cutover/README.md`,
„Phase 1c"): Restore (6,5 s, 464 654 / 10 497 / 6 260 / 125 / 18 / 21) →
**Gegenprobe** `migrate deploy` auf der Datenkopie scheitert (`P3018`/`23502`,
danach `P3009`, `migrate resolve --rolled-back`) → `TRUNCATE`-Wipe in 0,1 s →
Migration grün in 2,2 s → 9 Dateien importieren (128 594 / 1 282 / 1 095, wie
Phase 1a, bei erhaltenen 9 Usern / 3 Templates / 2 Queries) → **alle 9 Importe
per GUI-Endpunkt löschen** (14 s gesamt, danach 0 Fänge). Dev stand damit auf
0 Fängen / 165 Arten / 9 Usern / 3 Templates, ohne Import-Hashes — das war der
Startzustand für Phase 1b. **Überholt seit dem Reseed am 2026-11-15:** Dev trägt
jetzt die Produktionsdaten (oberster Block).
**Der Index ist da (#211, Release `92b9132`):** `FishCatch.samplingId` war der
Grund für das quadratische Löschen — der `ON DELETE RESTRICT`-FK scannte die
Fangtabelle einmal pro Sampling. Vorher/nachher auf denselben Daten: RI-Check
23,8 ms → 0,13 ms, `deleteImport` für `2026_T` 8,3 s → 0,52 s, voller
`DELETE`-Wipe des Prod-Klons ~6 min → 2,4 s. `TRUNCATE` bleibt trotzdem das
Wipe-Rezept; `CONCURRENTLY` ist bei 244 ms Index-Build auf 464 654 Zeilen kein
Thema (und von Prisma ohnehin nicht nutzbar). Guard: `lib/schemaIndexes.test.ts`.
Die beiden Nebenbefunde von vorher: `~/catchlogx-dev-restore.sh` scheiterte an
jedem Prod-Archiv aus der Zeit **vor** dem Cutover (`Sampling.importId NOT NULL`,
#202) und brach dabei **vor** dem App-Start ab (Wege: README + `PITFALLS.md`).
**Seit dem Post-Cutover-Satz läuft es wieder durch** (Reseed im obersten Block);
bei einem künftigen Schema-Sprung bleibt der Abbruch vor dem App-Start richtig.
**Aufgeräumt (#212, 2026-11-15):** `clx_prev` (91 MB), beide Dumps
(`pre-route-c-*`, `pre-imports-model-*`, zusammen 71 MB), die alte
Skript-Sicherung und der Drill-Account `route-c-drill` sind **weg** — Dev hat
wieder **9 User**, nur `clx` + `clx_shadow`, `QueryLog` leer. Es gibt damit
**keinen lokalen Rückweg** mehr auf den alten Stand: der 464 654-Fänge-Stand ist
die laufende Produktion und liegt als Nachtarchiv
`~/backups/20261115T023818Z.tar.zst` (54 MB), der 113 102-Zwischenstand ist
durch die 9 Cutover-Dateien reproduzierbar (~2 min).
**Überholt:** Phase 2 ist am 2026-11-15 gelaufen (oberster Block). Phase 1b (alle
13 Dateien, 183 855 Zeilen) ist damit **Nachlauf auf Produktion**, nicht mehr
Voraussetzung des Fensters; das `List`-Blatt für D ist mit #213 gestrichen.

**Stand 2026-11-15 (Trockenlauf Phase 1a grün, #204):** 9 der 13 Dateien sind
auf Dev durch den echten Import-Pfad gelaufen — **128 594 Fänge / 1 282
Samplings / 1 095 Sites**, exakt die erwarteten Zahlen; die vier blockierten
Dateien lehnen ab und schreiben nichts; `deleteImport` und die Rollback-Übung
sind geübt (Dump in eine zweite DB, `~/current` auf das Vor-#202-Release, App
diente die 18 Alt-Uploads, zurückgeflippt). Details und Zahlen:
`deploy/prod/cutover/README.md`, „Phase 1". **Drei Befunde ändern den Plan:**
(a) **Prisma-Timeout** — der 5-s-Default der interaktiven Transaktion killte
`2026_B`; Fix in **#209** (Release `f112736`, deployt), danach lief auch
`2026_T` (35 413 Zeilen, 36,4 s). (b) **`2026_D` ist strukturell blockiert**,
nicht durch die Art: die Datei hat kein `List`-Blatt und wird schon davor
abgelehnt — `CatchLogX-Data#7` muss für D mehr liefern als die zwei
`Proterorhinus marmoratus`-Zellen. (c) **Es gibt keine PIT-Daten**, weder in
den Dateien noch in der alten DB (0 echte Tags, 0 Wiederfänge); der
PIT-Stichproben-Schritt ist gestrichen, und die Site-Abdeckung schließt auf
`river_name`+`site_name` exakt (1 320 = 256 + 112 + 123 + 829), was die
Juni-23-Lieferung als echten Inhalt bestätigt (`CatchLogX-Data#207`).
**Überholt:** Phase 2 lief am 2026-11-15 (oberster Block). Offen ist nur
`CatchLogX-Data#7` — die Arten-Reparatur, **ohne** `List`-Blatt für D (#213).

**Stand 2026-11-15 (Arten-Validierung #80 und Imports-Modell #202 erledigt):** Die
Validierung prüft `species` gegen `fish_species` (nicht mehr gegen das
`List`-Blatt der Datei), ein fehlendes `List`-Blatt ist ein struktureller
Fehler, und eine unbekannte Art lehnt die ganze Datei mit allen Namen und
Zeilen ab. **#202 ist deployt** (Release `8a0f1f0`, Migration
`20261114230855_imports_model`): `Uploads` ist weg, `Imports` + `Sampling.importId
NOT NULL` sind da, der Upload importiert direkt, `deleteImport` nimmt Fänge,
Samplings und die Originaldatei mit. **Dev ist gewiped und neu aufgesetzt:**
0 Fänge / 0 Samplings / 0 Sites, 165 Arten aus `assets/species.json`, 9 User,
3 Templates; der Pre-Wipe-Dump lag als
`~/backups/pre-imports-model-20261114T231621Z.dump` (56 MB) auf `claw` und ist
beim Aufräumen am 2026-11-15 gelöscht worden (#212) — der 464 654-Fänge-Stand
lebt in der Produktion und im Nachtarchiv `~/backups/20261115T023818Z.tar.zst`.

**Stand 2026-11-14 (Cutover-Entscheidung, #200):** Die Prod-DB wird **neu
aufgebaut** statt migriert — `prisma migrate deploy` auf eine leere DB, dann
reiner Datei-Import aus `CatchLogX-Data` mit allen Validierungen aktiv, ids neu
vergeben. Runbook: `deploy/prod/cutover/README.md`. **Reihenfolge:** #203
(Blob-Inventur **erledigt 2026-11-14**: 18 Uploads, 0 unmatched, alle 18 als
Upload-Objekte im Datenrepo, `legacy-uploads-2026-06/inventur-prod-uploads.tsv`)
→ #80 (Arten-Validierung gegen `fish_species`) + #201 (**GUI-Fischarten seit
2026-11-14 erledigt**, `4ee3113`…`090bd3a`) → #202 (`Imports`-Modell für die
frische DB, **nächster Schritt**) → Excel-Reparaturen im -data-Repo (18
Zeilen, 2 Namen; `Salvelinus fontinalis × Salvelinus umbla` braucht Lenas
Zielnamen) → #204 (Runbook + Dev-Trockenlauf) → Prod-Fenster.
**#202-Reihenfolge (2026-11-14): Wipe → Migration → Import.** `Sampling.importId
NOT NULL` lässt sich nicht auf eine DB mit bestehenden Samplings anwenden, und
der Dev-Deploy fährt `prisma migrate deploy` im Deploy-Job — der Wipe auf Dev
muss also **vor** dem Push des #202-Commits passieren, sonst scheitert der
Deploy am `NOT NULL`-Alter. Phase 1 des Runbooks
(`deploy/prod/cutover/README.md`) ist entsprechend ausgeschrieben: 9 der 13
Dateien importieren heute (128 594 Zeilen), die vier artenblockierten warten auf
`CatchLogX-Data#7`.
**Cutover-Satz: 13 Dateien / 183 855 Fänge** (464 654 → −60 %). Die früher
genannten „~401 269" sind falsch: ein reiner Datei-Import reproduziert keine
Duplikate. **M ist nicht geparkt, sondern kommt nach dem Fenster als regulärer
Upload** (#206, 63 385 Fänge, 1 638 `site_name`-Zellen offen — blockiert
nichts). **Die 13 Juni-Uploads sind nicht verschollen:** sie sind byte-identisch
mit Repo-Dateien (`CatchLogX-Data#6`), die Rechnung „≈ 39 000" ist
zurückgenommen (Datei- vs. DB-Zeilenzahlen). Die Inventur vom 2026-11-14 hat es
bestätigt: **18 Uploads, 0 unmatched**; alle 18 liegen jetzt als Upload-Objekt
im Datenrepo (`legacy-uploads-2026-06/`, Manifest
`inventur-prod-uploads.tsv`). Zwei Befunde daraus: die Uploads liefen **im Juni**
(2026-06-18…24), nicht im Oktober, und **`2026_M` war in der Produktion**
(`DB_ERROR`) — ihre Zeilen stecken also im heutigen Bestand. Von den 5
Legacy-Dateien sind zwei content-identisch mit `2026_E_F`/`2026_S`; die drei
Juni-23-Dateien sind eine **eigene Lieferung** (45 380 Zeilen,
Donaukanal/Drau/Donau) — Nachimport als #207 angelegt. **#80 lehnt eine Datei
mit unbekannter Art komplett ab**, damit sind `2026_D`, `2026_E_F`, `2026_I` und
`2026_S` bis zur Reparatur aus `CatchLogX-Data#7` hart blockiert.

**Stand 2026-11-14 (#198, P1 erledigt):** `scripts/` ist nach Risikoklasse
getrennt (`demo/`, `data/`, `prod/`, `ops/`) und `lib/seedGuard.ts` verweigert
Seeds auf jeder DB, die Fänge enthält; `wipe-*` braucht
`ALLOW_DESTRUCTIVE_SEED=<hostname>/<db>`. Einstieg für eine neue DB ist
`npm run db:init`; `docker-compose.yml` seedet nicht mehr. **Offen in #198:**
P2 (GUI-Fischarten) ist als #201 am 2026-11-14 **erledigt**, P3 (Coverage-Check) geht in #204 auf,
P4/P5 sind durch den Cutover #200 ersetzt.
**Geparkte Frage (Entscheidung durch Georg, bewusst kein Ticket) — aufgelöst
2026-11-14:** Bestandsaufnahme Prod ↔ Excel-Archiv. Die Lücke ist **keine
fehlende Datei**, sondern Duplikat: Prod hat 464 654 Fänge, die 13 Cutover-Dateien
haben 183 855 Zeilen; der Rest sind Juni-Teilimporte derselben Dateien, die drei
Varianten der Juni-23-Lieferung und die früheren `E_F`/`S`-Fassungen. Die
sha256-Prüfung (`CatchLogX-Data#6`) zeigt, dass 13 der 18 Prod-Uploads
byte-identisch mit Repo-Dateien sind. P5 (Prod wipen und re-importieren) ist
durch den Cutover #200 ersetzt.
**Stand 2026-11-15 (#184, Löschung, Issue geschlossen):** Ein gelöschter Import verschwindet
**vollständig** aus der DB — Migration `20261115090551_import_hard_delete`
droppt `deletedAt`/`deletedByUserId` (und räumt die Tombstones mit weg),
`deleteImport` löscht Fänge → Samplings → `Imports`-Zeile → Blob, die einzige
Spur ist eine Journal-Logzeile. Die Originaldatei bleibt dauerhaft als
`FileBlob` (`Imports.blobId`) gespeichert, der Dialog bietet vorher „Download a
copy". Der früher geplante „Altbestand"-Block (`LegacyUploads`, 18 Juni-Uploads
mit Download, aber ohne Delete) entfällt: mit dem Cutover (#200) kommt der
Bestand als regulärer Import aus den Dateien, die 18 Uploads liegen archiviert
im Datenrepo (#203). Die Uploadverwaltung ist damit bewusst einfach: eine
Liste, Download, harter Delete. Details: `DECISIONS.md` (2026-11-15,
„Import-Löschung ist hart") und der Issue-Verlauf von #184.

**Stand 2026-11-10 (Send-Only-Mail Dev, #193):** `catchlogx.graf.priv.at` ist
als reine Sende-Domain eingerichtet (`noreply@…`), DNS in `mexx` (A statt
CNAME, SPF `ip4:85.215.162.182 -all`, DMARC strict, DKIM `clx`, kein MX) und
`claw` sendet direkt über loopback-postfix
(`127.0.0.1:25`, ohne Auth) mit OpenDKIM-Signatur; Doku
`deploy/vps/mail/README.md`. **Verifiziert**: Zustellung an `georg@graf.priv.at`
mit `dkim=pass` im empfangenden OpenDKIM, SpamAssassin `No, score=1.1`,
`opendkim-testkey` `key OK`, beide NS liefern die neuen Records; die Dev-`.env`
ist gesetzt und mit Release `a0ad6bc` gebaut, „Passwort vergessen" läuft mit
einem temporären Nutzer end-to-end (Link + Token geprüft, Testdaten entfernt).
**Verschärft am 2026-11-11** (mexx r391): DMARC `p=quarantine`, TTL 86400 —
nachdem Gmail eine Testmail mit `dkim=pass`/`spf=pass`/`dmarc=pass` in den
Posteingang gelegt hatte. **Der DKIM-Privatschlüssel ist gesichert**
(`pass show claw/dkim-clx-private`, privater SVN-Store r7808, verschlüsselt auf
`EC23CFDFDDA530BD`; Restore-Anleitung in `deploy/vps/mail/README.md`).
**Offen:** Schüler-Aufgabe #194 (App-Seite: Reset-/Reject-Mail belegen,
Fehlerbehandlung, `timestamp`-Robustheit in `POST /api/forgot-password`).

**Stand 2026-11-10 (Off-site-Transport, #192):** Der Off-site-Weg des
Prod-Backups läuft nicht mehr über den nginx-PUT-Endpoint, sondern über
**`knock` + `rsync`** als User **`catchlogx`** nach **`~/backups`** auf `claw`;
das Archiv ist ein **Klartext-`tar.zst`** (nur `env.age` bleibt verschlüsselt).
Der Empfangs-Key ist auf `rrsync -wo -no-del -no-overwrite` eingeschränkt, der
nginx-`/backup/`-Endpunkt samt htpasswd ist entfernt, Rotation/Integrität
laufen als User-Timer von `catchlogx`. Details: `deploy/prod/backup/README.md`,
`deploy/vps/offsite-backup/README.md`, `DECISIONS.md` 2026-11-10, `PITFALLS.md`.
Die Knock-Sequenz liegt ausschließlich in `/etc/catchlogx-backup.env`
(0600 root) — sie gehört nicht ins Repo (#189).

**Stand 2026-11-10 (Dev-Re-Seed, #188):** `catchlogx-dev-restore.sh` auf `claw`
spielt das neueste Prod-Archiv in `clx` ein (Wipe + Restore + `prisma migrate
deploy` + `clx_readonly`-Grants + Health-Check). **Kein Timer** — Aufruf von
Hand als `catchlogx`: `~/catchlogx-dev-restore.sh [--force]`. Das alte `clx`
bleibt bis zum grünen Health-Check als `clx_prev` erhalten. Voraussetzung ist
ein Klartext-Archiv aus #192; `age`-Archive aus der Zeit davor kann das Skript
nicht lesen.

**Nachtrag 2026-10-30 (#121), Dev für die SQL-Rollen-Umstellung vorbereitet:**
`clx_readonly` ist auf der Dev-Instanz jetzt die **einzige** lesende Rolle und
eine **Whitelist** (`SELECT` nur auf `fish_catches`, `samplings`,
`river_sites`, `fish_species`; `Uploads`/`FileBlob`/`UserQueries`/Auth-Tabellen
und `_prisma_migrations` gesperrt), verifiziert über TCP mit TLS. Grund: Jakobs
fertige #121-Arbeit ersetzt den `validateSQLQuery`-Blocklist durch diese Rolle
und die SQL-Seite verbindet mit **derselben** Rolle über `QUERY_DATABASE_URL`
(kein `clx_query`, kein `query-role.sh`). `QUERY_DATABASE_URL` steht in
`~/repos/georgernstgraf/CatchLogX/.env` (nur loopback; das Passwort ist
prozentkodiert, weil base64 `/`/`+` enthält) und ist im laufenden Prozess
sichtbar (Restart am 2026-10-30, Health-Check 200). **Stand 2026-11-04:** Jakobs #121 ist auf `dev` (`ef63d85`, `a035eef`, `546ea84`;
`query-role.sh`/`clx_query` gestrichen) und auf Dev deployt (Run 41855520925, Migration
`add_query_log` angewendet). End-to-end über die SQL-Seite geprüft: `fish_catches` lesbar,
`User`/`FileBlob`/`Uploads`/`QueryLog` sowie INSERT/CREATE/DROP → 403 mit sauberer Meldung,
ohne Session 401. **`QueryLog` auf Dev bestätigt (2026-11-06, Jakob per SSH und read-only `psql`):**
die Ablehnungen aus dem Rauchtest (`42501`, Mehrfach-Statement `42601`) und erfolgreiche SELECTs
mit User, `rowCount` und `durationMs` sind geloggt. **Erledigt am 2026-11-10 (#187):** (2) die
Prod-Grants sind verengt — **nicht** mit `./deploy/prod/postgres/readonly-role.sh` aus
`/root/CatchLogX` (dieser Checkout trackt `master` und enthält die alte „alles außer Auth"-Regel),
sondern mit der Datei aus `dev` (`git show origin/dev:… > /root/readonly-role-121.sh`,
`KEEP_PASSWORD=1`, keine Rotation); von außen nachgeprüft: nur die vier Forschungs-Tabellen lesbar,
`pg_default_acl` leer, `pg_stat_statements`/`_info` gesperrt, Sequenzen ohne Rechte. Der
Forschungsgruppe ist noch zu sagen, dass `Uploads`/`FileBlob`/`UserQueries`/`TemplateFiles` in R
weggefallen sind. (3) `statement_timeout` ist beantwortet und umgesetzt: **nicht** auf der Rolle
(sie dient auch der Forschungsgruppe in R), sondern `SET LOCAL statement_timeout` mit
`QUERY_TIMEOUT_MS = 10 s` im Query-Client (`services/queryService.ts`, Vitest). **Erledigt 2026-11-15 im Cutover:** `QUERY_DATABASE_URL` steht in
`~clxadmin/.config/catchlogx/.env`, Unit-Restart gelaufen, die SQL-Seite
liefert auf Prod (Cutover-Phase-2-Schritt 10).

**Stand 2026-10-29 (Härtung, #122):** Der Produktions-Host ist auf eine Regel
gebracht — **nichts von `clxadmin` außerhalb seines Homes, keine Erhöhung
möglich**. Der Runner ist eine **User-Unit** von `clxadmin`
(`~/actions-runner`, `Restart=always`, Linger), die System-Unit und
`/opt/actions-runner` sind weg; `clxadmin` ist aus `sudo`, `docker` und `lxd`
entfernt; die Laufzeit-Env liegt in `~clxadmin/.config/catchlogx/.env`, der
Checkout `/opt/CatchLogX` ist gelöscht (Runbooks: root-eigener Clone unter
`/root/CatchLogX`); SSH ist keys-only, `clxadmin` hat kein Passwort mehr, `root`
behält **bewusst** den Konsolen-Passwort-Login als Break-Glass. Der Deploy-Job
hat den docker-basierten „Retire the interim app container"-Schritt verloren.
Verifiziert: Deploy grün (Run 40831004953), Backup mit `env.age` grün,
`find /opt ! -user root` leer. Details: `docs/meetings/2026-10-29-host-haertung.md`,
`DECISIONS.md` 2026-10-29, `PITFALLS.md`, `deploy/prod/README.md`.

**Nachtrag 2026-10-29 (#172), Bedienbarkeit nach der Härtung:** `clxadmin`
hat jetzt `~/tools/node/bin` (Node **v22.23.3**, npm 10.9.9) im PATH
(`deploy/prod/shell/node-path.sh` → `~/.config/catchlogx/path.sh`, gesourct aus
`~/.profile`) und einen **von Hand** gepflegten Diagnose-Klon unter
`~/src/CatchLogX`, der `master` trackt und dessen `.env` auf
`~/.config/catchlogx/.env` symlinkt. Damit läuft
`npx prisma migrate status` auf dem Host (verifiziert: 2 Migrationen, Schema
aktuell; deploytes Release `d3216a8` ist Vorfahr von `master` `2620c6c`).
Bewusst **kein** Skript — die drei Zeilen stehen in `deploy/prod/README.md`
(„Checking prod by hand"). Die Node-Laufzeit ist in `deploy/prod/node/README.md`
dokumentiert (vorher stand sie nur in einer `ExecStart`-Zeile).

**Stand 2026-10-30:** Die Produktionsdatenbank ist **nativ** (#170, Pendant zu
#168 auf Dev): `postgresql@16-main`, echte Client-IPs, TLS angeboten, Backup und
Read-only-Rolle laufen auf dem Host-Pfad. `production-maintenance.yml` ist
gelöscht; Wartung passiert per SSH über das BOKU-VPN mit den Runbooks unter
`deploy/prod/postgres/`. Details in `docs/ai/STATE.md` und
`docs/meetings/2026-10-30-prod-postgres-native.md`. Der Container
`clx-postgres` bleibt gestoppt mit `restart=no` als Rückfallweg.

**Stand 2026-10-27:** Das zweite Vor-Ort-Fenster ist gelaufen. #143 ist **erledigt** —
die Produktion läuft als systemd-User-Unit (Release `37fbcf7`, `~/current` →
`~/releases/<sha>`), der Rollback wurde in beide Richtungen geübt und ein Reboot
startet die App ohne Login neu (`NRestarts=0`). Die Maschine ist reboot-fest:
statische Adresse **`141.244.222.191`** (#164 — die zuerst gepinnte `.9` war falsch),
**kein DHCP** mehr, Boot 23,8 s statt 2 min 22 s, `resolute-updates` laufen täglich,
`docker`/`containerd` nur im Fenster. Seit #164 hängt die App **nicht mehr direkt am
Netz**: nginx auf Port 80 proxyt auf `127.0.0.1:3001`, die alte URL auf `:3001`
leitet per 301 auf Port 80 um; Nutzer-URL ist `http://141.244.222.191` (ohne Port).
`clxadmin` ist rotiert (das alte Dev-Default aus dem public Repo ist über scram
abgewiesen), der Smoke-Account `smoke-test` ist gelöscht (#150), die MinIO-Container
sind weg (9000/9001 zu, Volume bleibt). Details, Runs und Entscheidungen:
`docs/meetings/2026-10-27-vor-ort-netzwerk-und-release-cutover.md`.

**Nachtrag 2026-10-27 (Abend), Zugang + Backup + Mail:** Direkter `root`-SSH-Zugang
zum Host existiert (persönlicher Key, #115). Damit ist die **Backup-Routine (#86) in
Betrieb**: täglich 02:30 UTC `pg_dump` + `age`-verschlüsselte `.env` + Off-site-Spiegel
auf die VPS, monatliche Restore-Probe am 1. um 04:30, Alarme über
`catchlogx-alert@.service`, Backup-Alter im SSH-Login-MOTD. Erster Lauf und erste Probe
grün (Details in `STATE.md`, Code in `deploy/prod/backup/` und
`deploy/vps/offsite-backup/`). Zusätzlich läuft ein **lokaler postfix** auf
`127.0.0.1:25`, der authentifiziert an `mailauth.boku.ac.at:25` relayt — das BOKUnet
lässt ausgehend nur Port 25 zu BOKUs Mailservern zu (Konto `ihyam_catchlogx`,
verifiziert). Die Backup-Berichte gehen bewusst **lokal** in `/var/mail/root`
(`mail -u root`), nicht über den Relay; der ist für App-Mail reserviert. Offen in
#160 bleibt nur noch: SMTP-Konto in postfix, `NODEMAILER_*` in der Prod-Env
(der Code-Teil ist seit 2026-11-10 auf `dev`), dann Reset end-to-end testen.

**Nachtrag 2026-10-27 (Nacht), Postgres-Exposition (#122/#152/#153):** Entscheidung
in `DECISIONS.md` („Postgres bleibt BOKU-weit offen"): **keine Firewall**, weil 5432
zwar aus dem BOKUnet (auch per BOKU-VPN), aber **nicht** von einer echten
Internet-Adresse erreichbar ist — die BOKU-Grenze filtert. Umgesetzt und verifiziert:
`clxadmin` (Superuser **und** App-Konto) auf einen 48-stelligen Zufallswert gedreht,
`clx_readonly` auf das gewünschte einfache Passwort (steht künftig im FAQ für
eingeloggte Nutzer, **aus der Env gelesen**, nie im Repo); beide Logins über TCP
getestet, altes Dev-Default abgewiesen, Read-only kann nicht schreiben und sieht die
Auth-Tabellen nicht. Postgres: `log_connections = on`,
`shared_preload_libraries = auth_delay`, `auth_delay.milliseconds = 1s` (Fehlversuch
1213 ms statt ~10). **Prometheus entfernt** (`*:9090`, ohne Auth, scrapte nur sich
selbst, 86 MB). Kein TLS für Postgres (Entscheidung, nicht vergessen). Aufgeschoben:
**#166 App-Rolle ohne Superuser** — braucht eine eigene Migrationsrolle für
`prisma migrate deploy` und Ersatz für die heute mitgenutzten reservierten
Superuser-Slots.

1. [ ] **DHCP-Pool-Ausschluss für `141.244.222.191`** (Martin / BOKU-IT). Der Host
   konfiguriert sich zwar selbst statisch, aber solange die Adresse im Pool liegt,
   kann ein anderes Gerät sie bekommen → Adresskonflikt. Gleichzeitig melden, dass
   `.9` am 2026-10-27 **versehentlich** belegt war und wieder freigegeben ist.
   Bis dahin: bei Verbindungsproblemen zuerst `ip -br a` auf der Maschine prüfen.
2. [ ] **#144 Gated Deploy-Pipeline** (nächster Code-Schritt): Prod-Deploy-Workflow
   `deploy-prod.yml` nach dem Muster von `deploy-dev.yml` (#178), gated auf `test` +
   `migration-drift`, `master`-Trigger, eigene Concurrency-Group
   (`cancel-in-progress: false`), Label `boku`. Danach `production-deploy.yml`
   entfernen (#137) und den Push-Trigger für `master` wiederherstellen. Die einmaligen Maintenance-Jobs sind mit #170 bereits weg
   (`production-maintenance.yml` gelöscht, Runbooks unter `deploy/prod/postgres/`).
3. [ ] **#159 Prod-Credentials**: kein Produktionspfad darf ein committetes
   Passwort nutzen (compose trägt weiterhin `clxadmin:clxadmin` als Dev-Default,
   auch in `SHADOW_DATABASE_URL`).
4. [ ] **#160 Passwort-Reset/Mail**: Host-Seite ist seit 2026-10-27 fertig
   (`deploy/prod/postfix/`: loopback-only postfix → `mailauth.boku.ac.at:25`,
   STARTTLS + SASL, Zertifikat verifiziert). Offen: (a) SMTP-Konto anlegen und per
   `/root/set-mail-auth.sh` eintragen, (b) **Code erledigt (2026-11-10):**
   `lib/mailer.ts` sendet ohne Auth, wenn `NODEMAILER_USER`/`NODEMAILER_PASSWORD`
   beide fehlen, Absender ist `NODEMAILER_FROM` (Fallback `NODEMAILER_USER`) über
   `mailFrom()`; auf Prod fehlt nur die Env (`NODEMAILER_HOST=127.0.0.1`,
   `NODEMAILER_PORT=25`, `NODEMAILER_FROM=<BOKU-Konto>`, siehe
   `deploy/prod/postfix/README.md`) plus Unit-Restart, (c) `NEXT_PUBLIC_APP_URL` ist seit
   #164 auf `http://141.244.222.191` (ohne Port) korrigiert, (d) Reset einmal
   end-to-end testen. `MAIL_TO`/`MAIL_FROM` in `/etc/catchlogx-backup.env` und der
   `root`-Alias in `/etc/aliases` hängen am selben Konto.
5. [x] **#161 maintenance-Jobs** — mit #170 **ausgemustert**: `production-maintenance.yml`
   und damit `audit`/`rehearse`/`cutover` existieren nicht mehr, es gibt keinen Code,
   der eine DB-URL auflösen müsste. Issue geschlossen.
6. [x] **#162 Deploy legt `.env` in jedes Release** — erledigt mit #164:
   `rm -f .env .next/standalone/.env` nach dem Build und `rm -f "$REL/.env"` in
   `publish-release.sh`.
7. [ ] **#163 Rollback-Rezept** überall auf den **vollen** Commit-SHA umstellen
   (kurze SHAs scheitern in `actions/checkout`).
8. [ ] **#153 In-App-Data-Access-Seite** (R-Verbindungsdaten + Read-only-Passwort
   für die Forschungsgruppe) — das Passwort liegt nur als `READONLY_DB_PASSWORD`
   in `/home/clxadmin/.config/catchlogx/.env`; Rotation = `deploy/prod/postgres/readonly-role.sh`
   per SSH (ohne `KEEP_PASSWORD=1`), Verifikation mit `KEEP_PASSWORD=1`.
9. [ ] **#145 Wissensbasis** nachziehen (Läufe #143/#152 sind jetzt vollständig
   dokumentiert; offen bleibt die Zusammenfassung im Datenrepo-Kontext).
10. [ ] **#115 Wartungszugang**: der Zugang existiert jetzt real — `root` per
    persönlichem SSH-Key (`grafg@spengergasse.at` **und** `georg@grafg`, seit
    2026-10-27), **kein** unprivilegierter Account, keine zweite Person. Mit der OE
    klären und dokumentieren, ob das so bleibt (Alternative: eigener `georg`-Account
    + sudo). **Erledigt am 2026-10-29:** `PasswordAuthentication no`
    (`deploy/prod/sshd/99-catchlogx-no-password.conf`, `KbdInteractiveAuthentication
    no`), `passwd -l clxadmin`; Key-Login für `root` **und** `clxadmin` bleibt
    (verifiziert), `root` behält den Passwort-Login **auf der Konsole** als
    Break-Glass — nicht weg-härten.
11. [ ] **MinIO-Volume** `catchlogx_clx_miniodata` endgültig löschen, sobald das
    Backup-Set `cutover-20261018T085752Z` (21 Objekte, 54 M) als ausreichend
    bewertet ist. Container sind bereits entfernt.
12. [ ] **#122 Restposten**: Backup-Routine läuft seit 2026-10-27 (#86, siehe oben) —
    offen bleibt das **Institut-Fileserver-Ziel** aus dem Issue (Pfad + Protokoll von
    Martin/Lena); bis dahin spiegelt die VPS. Entscheidung zum Vorgänger-Runner
    `catchlogx-server` umsetzen (er ist weiter der einzige Prod-Pfad). Nebenbefund
    2026-10-27: auf dem Host lauscht ein **snap-Prometheus auf `*:9090`** (scrapt nur
    sich selbst, 86 MB TSDB, ohne Auth erreichbar) und `ufw` ist installiert, aber
    **inaktiv** — beides bei der Härtung entsorgen bzw. auf `127.0.0.1` binden.
13. [ ] **#165 TLS vor Port 80** — seit #164 läuft der öffentliche Verkehr über
    HTTP; Login-Passwörter sind im BOKUnet im Klartext. Zertifikatsweg mit der OE
    klären, `:80`→`https` umleiten, `NEXT_PUBLIC_APP_URL` umstellen (Rebuild) und
    das Session-Cookie auf `secure: true` setzen.
14. [ ] See `CatchLogX-Data#2` — Zugriffsrechte der Diplomgruppe (Write akzeptiert,
    Decision D007); `README.md` und `docs/ai/STATE.md` im Datenrepo nachziehen.

15. [x] **#169 Query-Observability auf Prod** — mit #170 am 2026-10-30
    ausgerollt: die Settings stehen in der Cluster-Config, das Messfenster ist
    gestartet. Den Report zieht man per SSH (Runbook `deploy/postgres/README.md`),
    der `db-report`-Job existiert nicht mehr.
16. [ ] **#170 Nachlauf**: (a) **erledigt** — Deploy-Run 40825812338 auf
    `master` (`4eeee4a`): Guard meldet „Production is on the adopted,
    migration-tracked schema (baseline recorded).", `prisma migrate deploy`
    „2 migrations found / No pending migrations to apply.", Release publiziert,
    Health-Check grün; Reboot-Rehearsal danach: Cluster und App ohne Login
    online (Boot 36,5 s, Userspace 20,5 s), `NRestarts=0`, nginx 200,
    464.654 Fänge unverändert, Container bleibt `Exited`; `report.sql` auf dem
    neuen Pfad erzeugt einen 127-Zeilen-Report. Offen bleibt: (b) bei BOKU-IT
    einen **DNS-Namen** für `141.244.222.191` erbitten (nimmt die IP aus allen
    R-Configs und erlaubt später ein echtes Zertifikat); (c) Volume
    `catchlogx_clx_pgdata` und Docker erst entfernen, wenn die native DB Wochen
    inkl. Monatsprobe grün läuft. Der Runbook-Checkout ist seit #122
    **root-eigen** und wird bei Bedarf frisch geklont
    (`git clone https://github.com/georgernstgraf/CatchLogX /root/CatchLogX`);
    `/opt/CatchLogX` ist gelöscht, die Laufzeit-Env liegt in
    `/home/clxadmin/.config/catchlogx/.env`.
    Macht #153 die R-Verbindungsdaten sichtbar: Host `141.244.222.191`, Port
    5432, DB `clx`, Rolle `clx_readonly`, `sslmode=prefer` (oder `require`).
17. [x] **#171 Kapazität auf Prod und Dev**: `clx_readonly` hat auf **beiden**
    Instanzen **108** Verbindungen (Prod vorher 40, Dev 20), `max_connections = 200`
    (+ `superuser_reserved_connections = 5`, `work_mem = 8MB`) — vorher galt der
    PGDG-Default 100, womit 108 Slots gar nicht erreichbar waren.
    **Prod** (2026-10-29, SSH-Runbook aus `/root/CatchLogX`, Commit `1332258`):
    Config vorab per `postgres -C` geprüft, Restart in **2,4 s**, App `200`
    (loopback und nginx), `fish_catches` unverändert **464 654**, dann
    `KEEP_PASSWORD=1 ./readonly-role.sh` (keine Rotation) → `rolconnlimit = 108`,
    Rechte-Probe grün; Gegenprobe von außen: **5 gleichzeitige Startpakete** von
    einer Quell-IP alle nach ~1,28 s beantwortet.
    **Dev** (2026-10-29, `claw` über `tun0`/10.8.0.2 — Port 22 ist auf der
    öffentlichen IP ohne Port-Knocking **zu**, siehe `PITFALLS.md`; Web und
    5432 sind offen): neue versionierte
    `deploy/vps/postgres/99-catchlogx-capacity.conf` installiert, Restart in
    **2,5 s**, `ALTER ROLE clx_readonly CONNECTION LIMIT 108`, App `200` auf
    `127.0.0.1:40873` und `https://catchlogx.graf.priv.at`, `fish_catches`
    127 179 unverändert.
    Die ursprünglich gewünschte Grenze „**5 Verbindungen pro Client-IP**" ist
    **fallengelassen**: PostgreSQL hat kein solches Feature, und der Anlass war
    eine Fehldiagnose — 8 gleichzeitige TCP-Sessions und 4 gleichzeitige
    Postgres-Startpakete von **einer** Quell-IP wurden bedient (Messung im
    Issue, `PITFALLS.md`); ein Timeout ist nie das Symptom einer Postgres-Grenze,
    es war der Tunnel. Der Report-Abschnitt „CONNECTIONS PER CLIENT ADDRESS"
    bleibt als Diagnose (wer hält wie viele Verbindungen), ohne Schwelle.
    Kein Restart kostet Statistik: `pg_stat_statements.save = on` (198 Shapes,
    `stats_reset` unverändert nach dem Prod-Restart).

18. [ ] **#121 Rollout SQL-Seite auf `clx_readonly`**: Die SQL-Seite läuft nur mit
    `QUERY_DATABASE_URL` (Rolle `clx_readonly`, libpq-taugliche URL ohne `?connection_limit=`/`?schema=`),
    es gibt bewusst keinen Fallback auf die Admin-URL. **Dev:** Rolle verengt und Env gesetzt (Georg,
    2026-10-30); Code deployt und Rauchtest grün (2026-11-04, `546ea84`). **Prod-Grants sind seit
    2026-11-10 erledigt (#187):** die Rolle war dort nie verengt (der Checkout `/root/CatchLogX`
    trackt `master`, die Whitelist-Version lag nur auf `dev`) und konnte `FileBlob`, `Uploads`,
    `UserQueries`, `TemplateFiles`, `_prisma_migrations` und beide `pg_stat_statements`-Views lesen;
    behoben mit `git show origin/dev:deploy/prod/postgres/readonly-role.sh > /root/readonly-role-121.sh`
    und `KEEP_PASSWORD=1`, danach von außen nachgeprüft (`pg_default_acl` leer, Sequenzen frei von
    Rechten). **Prod seit 2026-11-15 gesetzt** (`QUERY_DATABASE_URL` +
    Unit-Restart im Cutover, Phase-2-Schritt 10); offen bleibt nur die In-App-Seite
    #153.

Kontext: Das Epic #125 bleibt offen, solange `CatchLogX-Data#2` offen ist. Vom
Produktions-Upgrade-Pfad #137–#153 sind #138–#143 und #150/#152 erledigt; offen
sind #144 (gated Pipeline), #153 (Data-Access-Seite) und #145 (Wissensbasis).
