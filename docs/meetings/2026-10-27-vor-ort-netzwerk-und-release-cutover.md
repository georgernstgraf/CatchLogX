# Vor-Ort-Fenster BOKU-Server — Netzwerk, Upgrades und Release-Cutover — 2026-10-27

> **Nachtrag (2026-10-27, nach dem Fenster — #164):** Die in diesem Protokoll
> genannte Adresse `.9` ist **falsch**. Die zugewiesene Adresse ist
> **`141.244.222.191`**; `.9` wurde beim statischen Pinnen versehentlich gesetzt
> und am selben Tag korrigiert (netplan, `/opt/CatchLogX/.env`, Doku). Die
> Konfigurationswerte unten sind bereits nachgezogen; die Schilderung des
> DHCP-Vorfalls bleibt historisch. Der Rechner steht seit #164 zusätzlich hinter
> nginx: die App bindet nur noch `127.0.0.1:3001`, öffentlich ist
> `http://141.244.222.191` (Port 80), und die alte `:3001`-URL leitet per 301
> dorthin um. Der DHCP-Ausschluss bei BOKU-IT betrifft jetzt `.191`; `.9` ist
> wieder frei. Details: `docs/ai/DECISIONS.md` (2026-10-27) und `deploy/prod/`.

Zweites Vor-Ort-Fenster am Produktionsrechner (`catchlogx-server`, 141.244.222.191).
Zweck: den in #143 blockierten Immutable-Release-Cutover abschließen (Linger fehlte),
den Rechner reboot-fest machen und die #122-Härtungsposten abarbeiten.
Grundlage: `docs/ai/HANDOFF.md`, `docs/ai/STATE.md`, #122, #143, #150, Protokoll
`2026-10-18-vor-ort-wartungstermin.md`.

## Attendees

- Georg (Betreuer, durchführt; Zugang als `root` per SSH-Key `grafg@spengergasse.at`)
- Martin Seebacher (BOKU-Technik, vor Ort)

## Ausgangslage

Produktion lief auf `4b04e52` als Container (`clx-web`, `node:20-alpine`); #143 war
am fehlenden systemd-User-Manager hängen geblieben (`sudo loginctl enable-linger`
braucht vor Ort ein Passwort). Der erste Reboot dieses Fensters deckte einen
zweiten, schwereren Fehler auf: der Rechner bezog seine Adresse per **DHCP** und
kam auf **141.244.223.17** statt der (damals fälschlich gepinnten) `.9` zurück —
alle Nutzer waren ausgesperrt, weil Personal und `NEXT_PUBLIC_APP_URL` auf diese
Adresse zeigen.

## Ergebnisse

### 1. System-Upgrades (Voraussetzung, nicht Teil von #143)

- `apt-get full-upgrade` als transiente Unit (`clx-apt-upgrade`) ausgeführt, damit
  ein SSH-Abbruch dpkg nicht mitten in der Transaktion erwischt.
- **84 Pakete, 0 Entfernungen**: docker-ce/-cli 29.5.3 → 29.9.2, containerd.io
  2.2.4 → 2.4.2, systemd 259.5 → 259.9, grub2-common, snapd, cloud-init,
  linux-firmware-*. **Kein Kernel-Update** (laufend 7.0.0-38 = neuester Stand).
- Vorher ein verifiziertes Dump gezogen:
  `~/catchlogx-backups/pre-apt-20261027T095229Z` (54 M, 97 TOC-Einträge).
- `docker-ce`/`containerd` ersetzen den Daemon → Container starten kurz neu
  (`unless-stopped`), App danach sofort wieder `200`.
- `needrestart` meldete keine Dienste mit veralteten Libraries (nur Logind/D-Bus,
  die der Reboot erledigt).

### 2. Netzwerk: kein DHCP mehr, Dienste gepinnt

- Subiquity-Installation schrieb `dhcp4: true`; `/etc/netplan/00-installer-config.yaml`
  ist jetzt statisch: `141.244.222.191/21`, Gateway `141.244.216.1`,
  DNS `141.244.7.11`/`141.244.7.10`.
- **Kein DHCP mehr** — auch der zweite NIC (`enp3s0`) ist bewusst unkonfiguriert;
  `ip -4 a` enthält 0 dynamische Adressen. Kabel gehört in `eno1` (onboard,
  MAC `c8:ff:bf:05:5e:3e`).
- `netplan 1.2` kennt **kein** `use-address` → „statische Adresse + DHCP nur für
  Optionen" ist nicht darstellbar; deshalb sind die vom DHCP angebotenen Werte
  gepinnt (Adresse, Gateway, DNS, Zeit).
- Zeit: chrony nutzt jetzt die vom DHCP beworbenen BOKU-Server
  (`141.244.7.123`, `141.244.3.24`, `141.244.3.37`, `prefer`) in
  `/etc/chrony/sources.d/10-boku.sources`; Referenz `phobos.boku.ac.at` bzw.
  `pelias.boku.ac.at`, die Ubuntu-NTS-Pools bleiben Fallback. Vorher lief der
  Host ausschließlich gegen `ntp.ubuntu.com`.
- Änderung mit Rollback-Automatik eingespielt (`systemd-run --on-active=180 …
  netplan apply`), damit ein falscher Wert den Rechner nicht stranden kann.

### 3. Boot-Stall beseitigt

- `systemd-networkd-wait-online` wartete standardmäßig auf **jeden** gemanagten
  Link und damit auf `enp3s0`, das keinen Carrier hat: **2 min 05 s** Bootzeit.
- Drop-in `/etc/systemd/system/systemd-networkd-wait-online.service.d/99-any-link.conf`
  (überschreibt auch den netplan-Generator-Drop-in) wartet nur auf `eno1`, hart
  begrenzt auf 15 s.
- Ergebnis: **23,8 s Boot gesamt, 7,0–7,4 s Userspace**.

### 4. Regelmäßige Upgrades aktiviert (#122)

- `Allowed-Origins` um `"${distro_id}:${distro_codename}-updates"` erweitert →
  Bugfix-Updates laufen ab jetzt täglich mit (vorher nur `-security`).
- `Package-Blacklist`: `docker`, `containerd` — ein unbeaufsichtigtes
  `docker-ce`/`containerd`-Upgrade ersetzt den Daemon und würde die App um ~06:30
  kurz unterbrechen. Der Container-Stack wandert nur in ein Fenster.
- `Automatic-Reboot "false"` explizit gesetzt (war Default).
- Dry-Run bestätigt: `Allowed origins are: … resolute-updates …`, Blacklist
  `docker containerd`.

### 5. #143 — Immutable-Release-Topologie

- `loginctl enable-linger clxadmin` → `Linger=yes`, User-Manager erreichbar.
- **machine-report** (read-only, Run [40486499739](https://github.com/georgernstgraf/CatchLogX/actions/runs/40486499739)):
  `is-system-running: running`, `State=lingering`, kein natives Node, `~/tools` leer.
- **release-topology** (Run [40486542995](https://github.com/georgernstgraf/CatchLogX/actions/runs/40486542995)) **fehlgeschlagen**:
  der Job lud `node-v22.23.3-linux-x64.tar.xz` als `node.tar.xz` herunter, prüfte
  aber `sha256sum -c` gegen `SHASUMS256.txt` — „FAILED open or read". Der Fehler
  war nie aufgefallen, weil jeder frühere Lauf schon am Linger-Gate starb.
  Fix: `2546d44` auf `dev` (`6b7305c`) und per Cherry-Pick auf `master`; Job lädt
  und entpackt jetzt unter dem Upstream-Namen.
- **release-topology** erneut (Run [40486798556](https://github.com/georgernstgraf/CatchLogX/actions/runs/40486798556)): Node v22.23.3 in
  `~/tools`, `/opt/CatchLogX/.env` (mode 600) aus der laufenden `clx-web` abgeleitet
  (`READONLY_DB_PASSWORD` erhalten), `catchlogx.service` geschrieben und **enabled**,
  nicht gestartet; genau eine Unit, Linger erkannt.
- Laufzeit-Env ergänzt: `NEXT_PUBLIC_APP_URL=http://141.244.222.191` (fehlte
  komplett → Passwort-Reset-Links waren `undefined/reset-password?token=…`) und
  `NEXTAUTH_URL` von `http://localhost:3001` auf die echte Adresse korrigiert.

### 6. Erster Release-Deploy

- Run [40486882358](https://github.com/georgernstgraf/CatchLogX/actions/runs/40486882358), 40 s: Build mit glibc Node 22,
  Adopted-Schema-Guard ok, `migrate deploy` ohne Änderung, Release
  `~/releases/2546d4469dd9d0b572a3b638a5da8d7a7bbe3848`, `clx-web` entfernt,
  Unit gestartet, Health `127.0.0.1:3001` ok.
- Danach: **genau ein** Listener auf `:3001`, gehalten von `next-server (v16.0.10)`;
  kein `clx-web` mehr; `~/current` → Release; App `200` lokal und über `.9`.

### 7. Rollback-Drill

- Run [40487062516](https://github.com/georgernstgraf/CatchLogX/actions/runs/40487062516) **fehlgeschlagen**: `actions/checkout`
  löst `ref: 38aad29` (kurzer SHA) nicht auf — nur Branches/Tags. Produktion blieb
  unberührt (`~/current` unverändert, App `200`).
- Run [40487137570](https://github.com/georgernstgraf/CatchLogX/actions/runs/40487137570) mit dem **vollen** SHA
  `38aad291ff9f24af8a06f4626c9e265cb7a8cbba`: Release publiziert, Health ok.
- Run [40487388231](https://github.com/georgernstgraf/CatchLogX/actions/runs/40487388231) zurück auf `master` (`2546d44`):
  Health ok. Beide Releases liegen in `~/releases/`.
- **Lehre**: jede Rollback-Anweisung muss einen vollen Commit-SHA nennen.

### 8. Reboot-Rehearsal (Akzeptanzkriterium)

- Reboot 10:20:04Z, Host nach 30 s wieder auf `.9`, Boot 7,4 s Userspace.
- `catchlogx.service`: **active**, `NRestarts=0`, gestartet ~26 s nach Boot —
  **ohne dass jemand eingeloggt war** (Linger + `WantedBy=default.target`).
- Container (`clx-postgres`) healthy, App `200`, Runner `active`, chrony auf
  BOKU-Referenz synchron.

### 9. Rotation und Aufräumen

- **`clxadmin`-Passwort rotiert** (war das Dev-Default aus dem public Repo, bei
  offenem Port 5432). `ALTER ROLE` über den Container-Socket, `DATABASE_URL` in
  `/opt/CatchLogX/.env` neu geschrieben (Wert nie ausgegeben), Unit-Restart.
  Verifikation über scram (nicht-loopback): altes Passwort **REJECTED**, neues
  **ACCEPTED**; App `200`, keine Prisma-Fehler im Journal.
- `.env`-Kopien aus beiden Release-Verzeichnissen entfernt (der Deploy kopiert die
  Datei vor dem Build in den Workspace, das Standalone-Bundle nimmt sie mit) —
  die Unit liest ausschließlich `EnvironmentFile=/opt/CatchLogX/.env`.
- **#150**: `smoke-test` gelöscht (kaskadiert auf Sessions) → 8 echte User übrig.
  Das Repo-Secret `PROD_SMOKE_PASSWORD` bleibt, damit `smoke-user` bei Bedarf neu
  provisionieren kann.
- **MinIO**: `clx-minio` gestoppt (Ports 9000/9001 zu) und zusammen mit
  `clx-minio-init` und `clx-postgres-shadow-init` entfernt. Das Volume
  `catchlogx_clx_miniodata` **bleibt** (Entscheidung vor Ort unten); die einzige
  Kopie der Alt-Objekte ist das Backup-Set `cutover-20261018T085752Z`
  (21 Objekte, 54 M).

### Stand nach dem Fenster

Release `2546d44`, Unit `active`/`enabled`, 8 User, 18 Uploads, 3 Templates,
21 Blobs, nur noch `clx-postgres` als Container, Boot 7,4 s, Adresse statisch `.191` (korrigiert, siehe Nachtrag).

## Offene Punkte

- [ ] **DHCP-Pool**: `141.244.222.191` muss für andere Hosts gesperrt werden (und `.9` ist wieder freigegeben)
      (Ausschluss oder Reservierung auf MAC `c8:ff:bf:05:5e:3e`) — sonst kann ein
      anderes Gerät die Adresse bekommen. Zuständig: Martin / BOKU-IT.
- [ ] **Mail-/Reset-Konfiguration**: `NODEMAILER_*` fehlt in der Laufzeit-Env →
      „Passwort vergessen" wirft. `NEXT_PUBLIC_APP_URL` ist jetzt gesetzt, damit
      die Links stimmen, sobald SMTP vorhanden ist.
- [ ] #144 (gated Deploy-Pipeline), #153 (Data-Access-Seite), #145 (Wissensbasis).
- [ ] #115: Wartungszugang dokumentieren (root per persönlichem Key, kein
      unprivilegierter Account, keine zweite Person) and discuss with the OE.
- [ ] MinIO-Volume `catchlogx_clx_miniodata` endgültig löschen, sobald das
      Backup-Set als ausreichend bewertet ist.

## Decisions

- Der Host nutzt **kein DHCP mehr**. Die vom DHCP-Server angebotenen Dienste
  (Adresse, Gateway, DNS, Zeit) sind als feste Konfiguration gepinnt, damit ein
  Lease-Wechsel nie wieder Personal aussperrt.
- **`resolute-updates` läuft täglich automatisch**, der Container-Stack
  (`docker`, `containerd`) nur in einem beaufsichtigten Fenster; kein
  automatischer Reboot.
- **Rollback-Ziel ist immer ein voller Commit-SHA** (`actions/checkout` löst
  kurze SHAs nicht auf).
- Das **MinIO-Volume bleibt** vorerst erhalten; nur die Container sind weg.
- `NEXT_PUBLIC_APP_URL` gehört zur Laufzeit-Env der Produktion — ohne sie sind
  Passwort-Reset-Links kaputt.

## Action Items

- [x] System-Upgrades + Pre-Upgrade-Dump — Georg — 2026-10-27
- [x] Netzwerk statisch pinnen, kein DHCP, BOKU-Zeitserver — Georg — 2026-10-27
- [x] Boot-Stall (`systemd-networkd-wait-online`) beheben — Georg — 2026-10-27
- [x] #143: Linger, `release-topology`, Release-Deploy, Rollback-Drill — Georg — 2026-10-27
- [x] Reboot-Rehearsal (Unit kommt ohne Login zurück) — Georg — 2026-10-27
- [x] `clxadmin`-Passwort rotieren, Smoke-Account löschen, MinIO-Container entfernen — Georg — 2026-10-27
- [ ] DHCP-Ausschluss `.191` veranlassen (und `.9` freigeben) — Martin — offen
