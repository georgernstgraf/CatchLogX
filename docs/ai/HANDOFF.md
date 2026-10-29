# Handoff

Offene Aufgaben für die nächste Session.

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
2. [ ] **#144 Gated Deploy-Pipeline** (nächster Code-Schritt): Prod-Deploy-Job in
   `test.yml`, gated auf `test` + `migration-drift`, `master`-Trigger, eigene
   Concurrency-Group (`cancel-in-progress: false`), Label `boku`. Danach
   `production-deploy.yml` entfernen (#137) und den Push-Trigger für `master`
   wiederherstellen. Die einmaligen Maintenance-Jobs sind mit #170 bereits weg
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
5. [ ] **#161 maintenance-Jobs**: `audit`/`rehearse`/`cutover` finden die DB-URL
   nicht mehr, seit `clx-web` weg ist (kein `PROD_DATABASE_URL`-Secret) — auf
   `/opt/CatchLogX/.env` umstellen oder mit #144 ausmustern.
6. [x] **#162 Deploy legt `.env` in jedes Release** — erledigt mit #164:
   `rm -f .env .next/standalone/.env` nach dem Build und `rm -f "$REL/.env"` in
   `publish-release.sh`.
7. [ ] **#163 Rollback-Rezept** überall auf den **vollen** Commit-SHA umstellen
   (kurze SHAs scheitern in `actions/checkout`).
8. [ ] **#153 In-App-Data-Access-Seite** (R-Verbindungsdaten + Read-only-Passwort
   für die Forschungsgruppe) — das Passwort liegt nur als `READONLY_DB_PASSWORD`
   in `/opt/CatchLogX/.env`; Rotation = `deploy/prod/postgres/readonly-role.sh`
   per SSH (ohne `KEEP_PASSWORD=1`), Verifikation mit `KEEP_PASSWORD=1`.
9. [ ] **#145 Wissensbasis** nachziehen (Läufe #143/#152 sind jetzt vollständig
   dokumentiert; offen bleibt die Zusammenfassung im Datenrepo-Kontext).
10. [ ] **#115 Wartungszugang**: der Zugang existiert jetzt real — `root` per
    persönlichem SSH-Key (`grafg@spengergasse.at` **und** `georg@grafg`, seit
    2026-10-27), **kein** unprivilegierter Account, keine zweite Person. Mit der OE
    klären und dokumentieren, ob das so bleibt (Alternative: eigener `georg`-Account
    + sudo). Nebenbefund vom 2026-10-27: `sshd` erlaubt weiterhin
    `PasswordAuthentication yes` (root selbst ist `prohibit-password`, aber jeder
    Account mit Passwort käme per Passwort rein) — beim nächsten Zugriff auf `no`
    stellen, nachdem geprüft ist, dass niemand mehr Passwort-Login braucht.
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
16. [ ] **#170 Nachlauf**: (a) Produktions-Deploy einmal dispatchen und prüfen,
    dass der neue Adopted-Schema-Guard über den Host-`psql` greift und
    `prisma migrate deploy` „No pending migrations" meldet; (b) bei BOKU-IT
    einen **DNS-Namen** für `141.244.222.191` erbitten (nimmt die IP aus allen
    R-Configs und erlaubt später ein echtes Zertifikat); (c) Volume
    `catchlogx_clx_pgdata` und Docker erst entfernen, wenn die native DB Wochen
    inkl. Monatsprobe grün läuft. `/opt/CatchLogX` hängt jetzt am richtigen
    Remote (`georgernstgraf/CatchLogX`) und wird per `git pull` aktuell gehalten;
    es ist der Runbook-Host (kein Build, keine Unit liest daraus außer `.env`).
    Macht #153 die R-Verbindungsdaten sichtbar: Host `141.244.222.191`, Port
    5432, DB `clx`, Rolle `clx_readonly`, `sslmode=prefer` (oder `require`).

Kontext: Das Epic #125 bleibt offen, solange `CatchLogX-Data#2` offen ist. Vom
Produktions-Upgrade-Pfad #137–#153 sind #138–#143 und #150/#152 erledigt; offen
sind #144 (gated Pipeline), #153 (Data-Access-Seite) und #145 (Wissensbasis).
