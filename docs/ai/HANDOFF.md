# Handoff

Offene Aufgaben für die nächste Session.

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
sichtbar (Restart am 2026-10-30, Health-Check 200). **Noch offen:** Jakobs Push
abwarten (er war blockiert, weil ein Push sofort deployt), Deploy + SQL-Seite
end-to-end prüfen, und **auf Prod** `KEEP_PASSWORD=1
./deploy/prod/postgres/readonly-role.sh` fahren (verengt dieselbe Rolle, kein
neues Passwort) und `QUERY_DATABASE_URL` in `~clxadmin/.config/catchlogx/.env`
nachziehen, dann `catchlogx.service` neu starten. Der Forschungsgruppe vorher
sagen, dass `Uploads`/`FileBlob`/`UserQueries`/`TemplateFiles` in R wegfallen.

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
#160 bleibt nur der Code-Teil: auth-loser Zweig für `127.0.0.1:25` plus
`NODEMAILER_FROM` in `lib/mailer.ts`, dann Reset end-to-end testen.

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
   `/root/set-mail-auth.sh` eintragen, (b) der auth-lose Zweig für
   `127.0.0.1:25` plus `NODEMAILER_FROM` in `lib/mailer.ts` (heute wird
   `NODEMAILER_USER` als Absender missbraucht), (c) `NEXT_PUBLIC_APP_URL` ist seit
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
    öffentlichen IP **zu**, Web und 5432 sind offen): neue versionierte
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

Kontext: Das Epic #125 bleibt offen, solange `CatchLogX-Data#2` offen ist. Vom
Produktions-Upgrade-Pfad #137–#153 sind #138–#143 und #150/#152 erledigt; offen
sind #144 (gated Pipeline), #153 (Data-Access-Seite) und #145 (Wissensbasis).
