# 2026-10-29 — Prod-Host-Härtung: Runner unter `clxadmin`, kein `/opt`, kein sudo (#122)

Remote-Fenster über das BOKU-VPN (kein Vor-Ort-Termin). Beteiligt: Georg.
Ausgangslage: App als User-Unit `catchlogx.service` (Release `4eeee4a`),
Postgres nativ (#170), Runner als **System**-Unit aus `/opt/actions-runner`,
`clxadmin` mit `(ALL:ALL) ALL` in der `sudo`-Gruppe und zusätzlich in `docker`
und `lxd` (beide faktisch root-äquivalent), Laufzeit-Env in
`/opt/CatchLogX/.env`.

## Ziel

Eine Regel: **nichts von `clxadmin` liegt außerhalb seines Homes, und
`clxadmin` kann nicht erhöhen.** DB-Wartung bleibt Sache von `root` (per SSH
bzw. Konsole) — die SQL-Teile laufen als OS-User `clxadmin` über `peer`, weil
die Objekte der App-Rolle gehören müssen.

## Ausgangsprüfung (read-only)

| Prüfung | Befund |
|---|---|
| Runner-Unit | System-Unit `/etc/systemd/system/...`, `User=clxadmin`, `ExecStart=/opt/actions-runner/runsvc.sh` |
| `clxadmin`-Gruppen | `sudo`(27), `docker`(983), `lxd`(101) |
| `sudo -l -U clxadmin` | `(ALL : ALL) ALL` |
| unter `/opt` von `clxadmin` | `/opt/CatchLogX` (26 M), `/opt/actions-runner` (3,6 G) |
| SSH | `PasswordAuthentication yes`, `clxadmin` mit gültigem Passwort |
| sudo-Nutzung in Jobs | **keine** — das einzige `sudo` im Runner-Log ist ein Fehlertext |

Sicherung vor dem Umbau: `install -m 600 /opt/CatchLogX/.env
/root/clx-env-20261029T064205Z` (identische `sha256`), dazu ein voller
Backup-Satz über die Unit (`env.age` + Off-site, 55,9 MB).

## Ablauf

1. **Runner → User-Unit** (`~/actions-runner`). System-Unit deaktiviert und
   gelöscht, User-Unit `~/.config/systemd/user/actions.runner.AlphaVIE-CatchLogX.catchlogx-server.service`
   mit `Restart=always`, `WantedBy=default.target`, Linger weiter aktiv.
   **Falle:** `bin` und `externals` waren **absolute** Symlinks nach
   `/opt/actions-runner` → Service starb mit **Status 127**. Jetzt relativ
   (`bin -> bin.2.338.0`, `externals -> externals.2.338.0`), damit ein Move oder
   ein Runner-Self-Update es nicht wieder bricht.
   Nachweis: Deploy Run [40831004953](https://github.com/georgernstgraf/CatchLogX/actions/runs/40831004953)
   grün, Release unverändert `4eeee4a`, App 200.
2. **Laufzeit-Env ins Home**: `/home/clxadmin/.config/catchlogx/.env`
   (`0600 clxadmin`), zuerst kopiert und per `sha256` verglichen, dann
   `EnvironmentFile=` umgestellt, `daemon-reload`, Restart. Der laufende Prozess
   hat `DATABASE_URL` (geprüft über `/proc/<pid>/environ`), App/nginx 200.
   `/etc/catchlogx-backup.env` → `APP_ENV_FILE` neu; Backup über die Unit grün
   inkl. `env.age`.
3. **`/opt/CatchLogX` gelöscht**, Runbook-Checkout stattdessen root-eigen unter
   `/root/CatchLogX` (frisch geklont). `readonly-role.sh KEEP_PASSWORD=1` von dort
   grün: falsches Passwort abgewiesen, Lesen erlaubt, Auth-Tabellen und DDL
   gesperrt, `CONNECTION LIMIT 40`.
4. **Deploy-Workflow**: `ENV_FILE` auf den neuen Pfad, den docker-basierten
   „Retire the interim app container"-Schritt und `APP_CONTAINER` entfernt.
   Deploy Run [40831614430](https://github.com/georgernstgraf/CatchLogX/actions/runs/40831614430)
   grün, Release `d3216a8`.
5. **Rechte**: `deluser clxadmin sudo`, `docker`, `lxd` → `id` zeigt nur noch
   `adm, cdrom, dip, plugdev, users`; `sudo -l -U clxadmin` → „not allowed".
6. **SSH**: `/etc/ssh/sshd_config.d/99-catchlogx-no-password.conf`
   (`PasswordAuthentication no`, `KbdInteractiveAuthentication no`),
   `sshd -t` → `reload`; `passwd -l clxadmin`. `sshd -T` bestätigt
   `passwordauthentication no`, `pubkeyauthentication yes`,
   `permitrootlogin prohibit-password`. Von außen geprüft: Passwort-Login für
   `root` **und** `clxadmin` → `Permission denied (publickey)`; Key-Login für
   beide erfolgreich. `root` bleibt `P` — **Konsolen-Login mit Passwort ist der
   Break-Glass-Weg und bleibt absichtlich bestehen.**
   Letzter Passwort-Login im Log: 2026-10-27 aus dem BOKUnet — niemand hängt daran.
7. **Reboot-Rehearsal**: Boot 30,2 s (Userspace 14,4 s), beide User-Units
   **ohne Login** aktiv (`NRestarts=0`), Prozess-Gruppen jetzt
   `4 24 30 46 100 1000` (kein sudo/lxd/docker), App 200, nginx 200,
   `postgresql@16-main` online, `getty@tty1` aktiv.
8. **Deploy ohne sudo/docker** Run [40831975869](https://github.com/georgernstgraf/CatchLogX/actions/runs/40831975869) grün.

## Ergebnis

- Runner: `catchlogx-server` `online`, Label `boku`, als **User-Unit** unter
  `clxadmin`; `sudo systemctl --user -M clxadmin@ …` ist der Verwaltungsweg.
- `find /opt -maxdepth 2 ! -user root` → leer (nur `containerd`, root).
- `sudo -l -U clxadmin` → verweigert; SSH keys-only; `clxadmin` ohne Passwort,
  Key-Login funktioniert weiter (`pam_unix` prüft in der *account*-Phase nur
  Ablauf, nicht das `!`-Lock).
- DB-Wartung: **`root` über VPN/Konsole**, SQL-Teile via
  `runuser -u clxadmin -- psql …` (peer). `clxadmin` selbst kann nichts mehr
  anstoßen; die DB-Rolle ist weiterhin Superuser (#166, DB-Ebene).

## Offen / Nebenwirkungen

- `/root/clx-env-20261029T064205Z` und `/root/catchlogx.service.bak-*` sind
  Sicherungen des Umbaus und können nach einer grünen Woche weg.
- Der gestoppte `clx-postgres` + Volume `catchlogx_clx_pgdata` bleiben als
  Rückfallweg; damit bleibt Docker installiert, aber nur `root` kann es nutzen
  (#170-Nachlauf).
- `#161` ist damit gegenstandslos (die `audit`/`rehearse`/`cutover`-Jobs
  existieren seit #170 nicht mehr) und wurde geschlossen.
- Nicht angefasst: netplan, nginx, chrony, postfix, Postgres-Config.
