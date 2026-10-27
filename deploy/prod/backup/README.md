# Production backup (BOKU host, #86)

Daily logical backup of the production database plus the runtime env, kept on
the host and mirrored encrypted to the VPS. A monthly **restore rehearsal**
proves that the newest set can actually be read back — an untested backup is an
assumption, not a backup.

## What is backed up

| Item | How | Where |
|---|---|---|
| Database `clx` (all fishing data, users, sessions, uploads, templates, file blobs) | `pg_dump -Fc` streamed out of `clx-postgres` | `<set>/db.dump` |
| Restorability proof / table of contents | `pg_restore --list` | `<set>/db.dump.list` |
| Row counts and `FileBlob` byte total **at dump time** | `psql` (no password: local socket in the container is trusted) | `<set>/rowcounts.txt` |
| `/opt/CatchLogX/.env` (only copy of `DATABASE_URL`, `NEXTAUTH_SECRET`, `READONLY_DB_PASSWORD`) | `age` to the operator's public key | `<set>/env.age` |
| Checksums of the above | `sha256sum` | `<set>/SHA256SUMS` |

Not backed up on purpose: `~/releases` (reproducible from git), the
`catchlogx_clx_pgdata` volume (a logical dump is the better artifact), the
MinIO volume (obsolete, see #131), `/etc` (in `deploy/prod/` or package state).

**The dump never travels in a mail.** The BOKU relay (`mailauth.boku.ac.at`)
accepts messages up to 50 MB; the dump is ~56 MB and growing.

## Files and their target on the host

| File here | Target on the host | Mode |
|---|---|---|
| `backup.sh` | `/usr/local/bin/catchlogx-backup` | `755 root:root` |
| `catchlogx-backup.service` + `.timer` | `/etc/systemd/system/` | `644 root:root` |
| `catchlogx-backup-probe.service` + `.timer` | `/etc/systemd/system/` | `644 root:root` |
| `catchlogx-alert@.service` | `/etc/systemd/system/` | `644 root:root` |
| `catchlogx-backup.env.example` | `/etc/catchlogx-backup.env` (filled in, **no** `.example`) | `600 root:root` |

Packages: `age` (`apt install age`), `zstd`, `curl`, `postfix` (see
`../postfix/`). Runner: the units run as `clxadmin` because that user is in the
`docker` group; `EnvironmentFile` is read by systemd as root, so secrets stay
unreadable for the backup user.

## Install

```sh
install -m 755 deploy/prod/backup/backup.sh /usr/local/bin/catchlogx-backup
install -m 644 deploy/prod/backup/catchlogx-backup.service \
             deploy/prod/backup/catchlogx-backup.timer \
             deploy/prod/backup/catchlogx-backup-probe.service \
             deploy/prod/backup/catchlogx-backup-probe.timer \
             deploy/prod/backup/catchlogx-alert@.service /etc/systemd/system/
install -m 600 deploy/prod/backup/catchlogx-backup.env.example /etc/catchlogx-backup.env
$EDITOR /etc/catchlogx-backup.env       # MAIL_TO, age recipient, off-site
systemctl daemon-reload
systemctl enable --now catchlogx-backup.timer catchlogx-backup-probe.timer
```

## Daily run (`catchlogx-backup run`, 02:30 UTC ±15 min)

1. `pg_dump -Fc` → `db.dump`, then `pg_restore --list` — a dump that cannot be
   listed is treated as a failure and the set is discarded.
2. Row counts (`User`, `Session`, `PasswordResets`, `Uploads`, `TemplateFiles`,
   `FileBlob`, `UserQueries`, `fish_*`, `river_sites`, `samplings`) plus
   `sum(length("FileBlob".data))` are frozen into `rowcounts.txt`. The restore
   probe compares against **these** numbers, never against live production.
3. `.env` → `env.age` (public key only; nothing to decrypt on this host).
4. Off-site: the whole set becomes one `age`-encrypted `tar.zst`, uploaded with
   `curl -T` and verified by comparing the remote `Content-Length` with the
   local byte count. Skipped with a warning when `OFFSITE_URL` is empty.
5. Prune: newest `KEEP_DAILY` sets, plus the 1st-of-month sets (up to
   `KEEP_MONTHLY`). Hand-made sets (`cutover-…`, `pre-apt-…`) are never removed.
6. One mail: sizes, counts, off-site result, duration — or nothing but journald
   when `MAIL_TO` is empty. Failures go through `catchlogx-alert@…` (systemd
   `OnFailure`), which mails the journal tail of the failing unit.

## Monthly restore rehearsal (`catchlogx-backup probe`, 1st at 04:30 UTC)

Restores the newest `db.dump` into the scratch database `clx_restore_probe`
(dropped before and after), compares every recorded count and the blob byte
total against `rowcounts.txt`, and mails the verdict. A mismatch fails the unit
**and** sends the diff — the two ways to miss this (silent failure, silent
success) are both closed.

## Manual restore (disaster)

```sh
SET=$(ls -1d /home/clxadmin/catchlogx-backups/20* | sort -r | head -1); echo "$SET"

# 1. stop the app so nothing writes while the database is swapped
sudo -u clxadmin XDG_RUNTIME_DIR=/run/user/1000 systemctl --user stop catchlogx.service

# 2. restore into a NEW database, verify, then rename - never restore over live
docker exec clx-postgres createdb -U clxadmin clx_restore
docker exec -i clx-postgres pg_restore -U clxadmin -d clx_restore --no-owner --no-privileges < "$SET/db.dump"
docker exec clx-postgres psql -U clxadmin -d clx_restore -c 'select count(*) from fish_catches;'   # see rowcounts.txt

# 3. swap
docker exec clx-postgres psql -U clxadmin -d postgres -c 'alter database clx rename to clx_broken;'
docker exec clx-postgres psql -U clxadmin -d postgres -c 'alter database clx_restore rename to clx;'
sudo -u clxadmin XDG_RUNTIME_DIR=/run/user/1000 systemctl --user start catchlogx.service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/

# 4. the env, if it was lost too
age -d -i ~/clx-backup-key.txt "$SET/env.age" > /tmp/restored.env   # on YOUR machine
```

`clx_broken` stays until the restore is confirmed — it is the way back.

## Key ceremony (once)

The `age` identity is the recovery key for `env.age` and for every off-site
archive. It **must not** live on the host: a key on the machine encrypts
nothing for whoever holds the machine.

1. On your own machine: `age-keygen -o ~/clx-backup-key.txt` → prints
   `Public key: age1…`. Store the private file in the password manager and on
   paper; two independent copies, no third on any server.
2. Put only the public key into `BACKUP_AGE_RECIPIENT` on the host.
3. After the first run, prove the key works:
   `scp clxadmin@141.244.222.191:catchlogx-backups/<set>/env.age . && age -d -i ~/clx-backup-key.txt env.age`
4. Once a year (and after every key change): same command, newest set.

## Acceptance

```sh
/usr/local/bin/catchlogx-backup status              # sets, ages, config, timers
systemctl start catchlogx-backup.service            # one real run; then read the mail
systemctl start catchlogx-backup-probe.service      # one real rehearsal
journalctl -u catchlogx-backup -n 50 --no-pager
docker exec clx-postgres psql -U clxadmin -d postgres -c '\l'   # no clx_restore_probe left
```

## Known limits

- **RPO 24 h.** One dump per day; there is no WAL archiving, so a crash at 02:29
  loses the previous day. Point-in-time recovery would need `pg_basebackup` +
  archive_command (own ticket).
- **Off-site is a stopgap.** #86 wants a directory on the institute's file
  server. The transport is one function (`upload_offsite`); switching targets
  changes configuration, not code.
- **`env.age` is only as good as the key copy.** Lose the identity and the env
  backup is worthless; the database dump stays readable, and the secrets can be
  reissued (`ALTER ROLE`, the `readonly-role` job, a new `NEXTAUTH_SECRET` —
  which invalidates all sessions).
- **The scratch database costs disk.** ~114 MB while it exists; it is dropped
  in the same run, also on failure.
