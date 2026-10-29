# 2026-10-30 — Produktion: PostgreSQL nativ, Wartung über BOKU-VPN (#170)

Remote-Fenster über das BOKU-VPN (kein Vor-Ort-Termin). Beteiligt: Georg.
Ausgangslage: `clx-postgres` (`postgres:16-alpine`, 16.14) im Container,
Volume `catchlogx_clx_pgdata`, App als systemd-User-Unit seit #143.

## Warum

Pendant zu #168 auf Dev. Der Container war die letzte Stelle, die echte
Client-IPs verschluckte (`%r` = `172.18.0.1`), jede Settings-Änderung kostete
einen Container-Restart, und Konfiguration/Logs lagen im Volume. Außerdem war
`production-maintenance.yml` (2000 Zeilen, 67 `docker exec`) nur nötig, weil es
keinen SSH-Pfad gab — seit 2026-10-27 gibt es `root`-SSH über das BOKU-VPN.

## Vorbereitung (ohne Downtime, 2026-10-29)

- PGDG-Repo + `postgresql-16`/`postgresql-client-16` (16.15) installiert;
  Ubuntu 26.04 hat nur 18 im Archiv.
- Cluster `16/main` mit `--locale=en_US.UTF-8` angelegt (dieselbe Kollation wie
  die Container-DB), `start.conf = manual`, damit er nicht mit dem Container um
  5432 konkurriert.
- Zwei Fallen dabei gefunden und im Provisioning-Skript gefixt:
  - Ubuntu liefert `#include_dir = 'conf.d'` **auskommentiert** → die ganze
    `99-catchlogx.conf` wurde still ignoriert (Cluster startete mit
    Debian-Defaults: kein Preload, kein TLS, kein `logging_collector`).
  - `pg_createcluster` nimmt Port **5433**, weil 5432 belegt ist; `postgresql.conf`
    muss auf 5432 korrigiert werden, sonst sind `pg_ctlcluster`/`pg_lsclusters`
    verwirrt.
- Config-Test auf Wegwerf-Port 5499: `shared_preload_libraries =
  auth_delay, auto_explain, pg_stat_statements`, `ssl=on`, `TLSv1.2`,
  `log_min_duration_statement=2s`, `auto_explain.log_min_duration=500ms`,
  `logging_collector=on` — alles aus der Datei, kein `ALTER SYSTEM`-Tanz.
- Generalprobe: Prod-Dump (54 MB) in eine Scratch-DB auf dem neuen Cluster
  restored → **alle 14 Zählwerte identisch** (u. a. `fish_catches 464654`,
  `FileBlob 21 / 56.580.540 Bytes`), Kollation `en_US.UTF-8`, `report.sql`
  bricht erwartungsgemäß ab, solange `pg_stat_statements` fehlt.

## Fenster (2026-10-29 05:48–05:50 UTC, App-Ausfall ~20 s)

1. Baseline-Zählwerte aus dem Container eingefroren, Hand-Backup
   `pre-native-20261029T054835Z` (Dump 54 MB, 97 Einträge in der Liste).
2. App gestoppt, `docker update --restart=no clx-postgres` + `docker stop`
   (Volume `catchlogx_clx_pgdata` **bleibt**, 273 MB).
3. Nativen Cluster gestartet, Rollen `clxadmin` (bestehendes Passwort aus
   `/opt/CatchLogX/.env`, **nicht** rotiert) und `clx_readonly` (bestehendes
   Passwort, `CONNECTION LIMIT 40` statt 20), `clx` mit `en_US.UTF-8` angelegt,
   `pg_restore --no-owner --role=clxadmin`.
4. Verifikation: alle 14 Zählwerte identisch, `_prisma_migrations` 2/2 applied,
   12 Tabellen alle `clxadmin`, 9 SELECT-Grants für `clx_readonly`, Kollation
   `en_US.UTF-8`. `clx_shadow` bewusst **nicht** restauriert.
5. `observability-extension.sql`: Extension angelegt, `SELECT … FROM PUBLIC`
   widerrufen. Die beiden `ALTER SYSTEM`-Zeilen daraus wurden danach wieder
   zurückgenommen, damit `conf.d` alleinige Quelle bleibt.
6. `start.conf = auto`, App gestartet, `curl` direkt und über nginx: 200.
7. Backup-Skript + Units auf den Host-Pfad installiert: `run` grün (14 s, 54 MB,
   Off-site 55.928.163 Bytes größenverifiziert), `probe` grün (4 s, Scratch-DB
   wieder weg). Der alte, root-eigene Satz `20261017T231312Z` konnte vorher
   nicht gepruned werden (Permission denied) → `chown -R clxadmin`.
8. `readonly-role.sh` mit `KEEP_PASSWORD=1`: falsches Passwort abgewiesen,
   richtiges akzeptiert (TLSv1.3), `Session`/`User`/`PasswordResets` gesperrt,
   `CREATE TABLE` verweigert, Attribute `false|false|false|true|40`. Rotation
   mit Wegwerf-Rolle (`clx_readonly_selftest`) ebenfalls grün, danach gedroppt.
9. Messfenster gestartet (`pg_stat_statements_reset()`, `pg_stat_reset()`).

## Ergebnis / Beobachtungen

- `%r` zeigt jetzt echte Quellen: externe `psql`-Verbindung erscheint als
  `141.244.222.191(43890)`, die App als `127.0.0.1/32` mit **TLSv1.3**.
- `clx` 114 MB, PGDATA 361 MB, Volume 273 MB, Platte 22 von 468 GB belegt.
- Container: `state=exited`, `restart=no` — Rollback = Cluster stoppen,
  `docker start clx-postgres`, App neu starten.
- `/opt/CatchLogX`: Remote war noch die alte Org (`AlphaVIE/CatchLogX`), jetzt
  `georgernstgraf/CatchLogX`; Checkout war 41 Commits hinter `master` und hatte
  124 MB root-eigene `.next`-Leichen aus der Container-Ära (entfernt).

## Offen

- Deploy-Pipeline gegen den neuen Guard einmal laufen lassen (muss „No pending
  migrations" melden).
- DNS-Name für den Host (BOKU-IT) → würde die IP aus allen R-Configs nehmen und
  später ein echtes Zertifikat erlauben.
- Volume + Docker selbst erst entfernen, wenn die native DB Wochen inkl.
  Monatsprobe grün läuft.
- #166 (App-Rolle ohne Superuser) bleibt unverändert offen.
