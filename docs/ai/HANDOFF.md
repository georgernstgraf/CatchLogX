# Handoff

Offene Aufgaben für die nächste Session.

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

1. [ ] **DHCP-Pool-Ausschluss für `141.244.222.191`** (Martin / BOKU-IT). Der Host
   konfiguriert sich zwar selbst statisch, aber solange die Adresse im Pool liegt,
   kann ein anderes Gerät sie bekommen → Adresskonflikt. Gleichzeitig melden, dass
   `.9` am 2026-10-27 **versehentlich** belegt war und wieder freigegeben ist.
   Bis dahin: bei Verbindungsproblemen zuerst `ip -br a` auf der Maschine prüfen.
2. [ ] **#144 Gated Deploy-Pipeline** (nächster Code-Schritt): Prod-Deploy-Job in
   `test.yml`, gated auf `test` + `migration-drift`, `master`-Trigger, eigene
   Concurrency-Group (`cancel-in-progress: false`), Label `boku`. Danach
   `production-deploy.yml` und die einmaligen Maintenance-Jobs entfernen (#137),
   Push-Trigger für `master` wiederherstellen.
3. [ ] **#159 Prod-Credentials**: kein Produktionspfad darf ein committetes
   Passwort nutzen (compose trägt weiterhin `clxadmin:clxadmin` als Dev-Default,
   auch in `SHADOW_DATABASE_URL`).
4. [ ] **#160 Passwort-Reset/Mail**: `NODEMAILER_*` fehlt in der Prod-Env →
   „Passwort vergessen" wirft. `NEXT_PUBLIC_APP_URL` ist seit 2026-10-27 gesetzt
   und seit #164 auf `http://141.244.222.191` (ohne Port) korrigiert.
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
   in `/opt/CatchLogX/.env`; Rotation = `readonly-role` erneut dispatchen.
9. [ ] **#145 Wissensbasis** nachziehen (Läufe #143/#152 sind jetzt vollständig
   dokumentiert; offen bleibt die Zusammenfassung im Datenrepo-Kontext).
10. [ ] **#115 Wartungszugang**: der Zugang existiert jetzt real — `root` per
    persönlichem SSH-Key (`grafg@spengergasse.at`), **kein** unprivilegierter
    Account, keine zweite Person. Mit der OE klären und dokumentieren, ob das so
    bleibt (Alternative: eigener `georg`-Account + sudo).
11. [ ] **MinIO-Volume** `catchlogx_clx_miniodata` endgültig löschen, sobald das
    Backup-Set `cutover-20261018T085752Z` (21 Objekte, 54 M) als ausreichend
    bewertet ist. Container sind bereits entfernt.
12. [ ] **#122 Restposten**: Backup-Routine definieren (#86 — die vorhandenen Sets
    unter `~/catchlogx-backups/` sind manuell/Job-erzeugt, kein Zeitplan);
    Entscheidung zum Vorgänger-Runner `catchlogx-server` umsetzen (er ist weiter
    der einzige Prod-Pfad).
13. [ ] **#165 TLS vor Port 80** — seit #164 läuft der öffentliche Verkehr über
    HTTP; Login-Passwörter sind im BOKUnet im Klartext. Zertifikatsweg mit der OE
    klären, `:80`→`https` umleiten, `NEXT_PUBLIC_APP_URL` umstellen (Rebuild) und
    das Session-Cookie auf `secure: true` setzen.
14. [ ] See `CatchLogX-Data#2` — Zugriffsrechte der Diplomgruppe (Write akzeptiert,
    Decision D007); `README.md` und `docs/ai/STATE.md` im Datenrepo nachziehen.

Kontext: Das Epic #125 bleibt offen, solange `CatchLogX-Data#2` offen ist. Vom
Produktions-Upgrade-Pfad #137–#153 sind #138–#143 und #150/#152 erledigt; offen
sind #144 (gated Pipeline), #153 (Data-Access-Seite) und #145 (Wissensbasis).
