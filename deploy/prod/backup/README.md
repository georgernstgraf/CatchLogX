# Production backup (BOKU host, #86)

Daily logical backup of the production database plus the runtime env, kept on
the host and mirrored encrypted to the VPS. A monthly **restore rehearsal**
proves that the newest set can actually be read back — an untested backup is an
assumption, not a backup.

## What is backed up

| Item | How | Where |
|---|---|---|
| Database `clx` (all fishing data, users, sessions, uploads, templates, file blobs) | `pg_dump -Fc` over the local socket of the native cluster | `<set>/db.dump` |
| Restorability proof / table of contents | `pg_restore --list` | `<set>/db.dump.list` |
| Row counts and `FileBlob` byte total **at dump time** | `psql` (no password: peer auth as `clxadmin`) | `<set>/rowcounts.txt` |
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

Packages: `age` (`apt install age`), `zstd`, `curl`, `postgresql-client-16` (from
PGDG, matching the cluster), `postfix` (see `../postfix/`). Runner: the units
run as `clxadmin` because the native cluster maps that OS user to the DB role
`clxadmin` via `local all clxadmin peer` in `pg_hba.conf` (#170) — that is what
makes `pg_dump`/`psql`/`pg_restore` work without any password.
`EnvironmentFile` is read by systemd as root, so secrets stay unreadable for the
backup user.

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
6. One report per run. By default it is delivered **locally** into
   `/var/mail/root` (read with `mail -u root`) — the host's own mailbox, no
   external account, no SMTP round trip. See "Reports" below. Failures go
   through `catchlogx-alert@…` (systemd `OnFailure`), which mails the journal
   tail of the failing unit to the same place.

## Reports: the local mailbox is the default

The operator does not have a mailbox to fetch mail from, so the reports stay on
the machine:

```
backup.sh → sendmail → postfix → local(8) → /var/mail/root
```

- Read them: `mail -u root` (as root; `bsd-mailx` is installed) or
  `less /var/mail/root`. Navigation: `1` read message 1, `d` delete, `q` quit.
- A report nobody reads is worthless, so three cheap counterweights exist: the
  login banner (`/etc/update-motd.d/95-catchlogx-backup`) shows backup age,
  last probe result and the number of waiting messages; `catchlogx-backup
  status` shows the same plus the timer state; the mailbox itself keeps the
  narrative (sizes, counts, off-site result, duration).
- **A second copy can go out** via `MAIL_COPY_TO` (set to the BOKU mailbox of
  the service account, `ihyam_catchlogx@boku.ac.at`, since 2026-10-27). One
  message, two recipients: postfix delivers the local one itself and relays the
  copy — a broken SMTP account can never silence the local report, and a broken
  local delivery cannot swallow the copy. Read either with mutt (`../mutt/`):
  `Ctrl-L` local, `Ctrl-F` INBOX.
- The authenticated SMTP relay (`../postfix/`) carries only that copy and mail
  the app sends to real recipients (#160, password reset).
- The mailbox grows by a few kilobytes per day. It lives on the same disk as
  everything else, which is fine: these are notifications, not backups.

## Monthly restore rehearsal (`catchlogx-backup probe`, 1st at 04:30 UTC)

Restores the newest `db.dump` into the scratch database `clx_restore_probe`
(dropped before and after), compares every recorded count and the blob byte
total against `rowcounts.txt`, and mails the verdict. A mismatch fails the unit
**and** sends the diff — the two ways to miss this (silent failure, silent
success) are both closed.

## Manual restore (disaster)

Run the database commands **as `clxadmin`** (`sudo -iu clxadmin`): peer auth maps
that OS user to the DB role of the same name, so the restored tables belong to
the app role again. As root you would have to prefix every line with
`runuser -u clxadmin --`; restoring as `postgres` would leave the tables owned
by the wrong role.

```sh
# as clxadmin
SET=$(ls -1d /home/clxadmin/catchlogx-backups/20* | sort -r | head -1); echo "$SET"

# 1. stop the app so nothing writes while the database is swapped
XDG_RUNTIME_DIR=/run/user/1000 systemctl --user stop catchlogx.service

# 2. restore into a NEW database, verify, then rename - never restore over live
createdb -U clxadmin clx_restore
pg_restore -U clxadmin -d clx_restore --no-owner --no-privileges < "$SET/db.dump"
psql -U clxadmin -d clx_restore -c 'select count(*) from fish_catches;'   # see rowcounts.txt

# 3. swap (needs the app role to have CREATEDB - it is a superuser today, #166)
psql -U clxadmin -d postgres -c 'alter database clx rename to clx_broken;'
psql -U clxadmin -d postgres -c 'alter database clx_restore rename to clx;'
XDG_RUNTIME_DIR=/run/user/1000 systemctl --user start catchlogx.service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/

# 4. the env, if it was lost too (on YOUR machine)
age -d -i ~/clx-backup-key.txt "$SET/env.age" > /tmp/restored.env
```

`clx_broken` stays until the restore is confirmed — it is the way back.

## Key ceremony (once)

The `age` identity is the recovery key for `env.age` and for every off-site
archive. It **must not** live on the host: a key on the machine encrypts
nothing for whoever holds the machine. On the operator's machine it lives in
`pass` as `boku/age` (the public half, `age1…`, is in `BACKUP_AGE_RECIPIENT`).

```sh
# the identity never touches the host and never gets printed
pass show boku/age > /tmp/clx-age.key && chmod 600 /tmp/clx-age.key
```

Rehearsed end to end on **2026-10-27** (newest off-site archive, pulled back
from the VPS):

```sh
NAME=20261027T205026Z.tar.zst.age
ssh claw "sudo cat /srv/backups/catchlogx/$NAME"        > "$NAME"
ssh claw "sudo cat /srv/backups/catchlogx/$NAME.sha256" > "$NAME.sha256"
sha256sum -c "$NAME.sha256"                              # → OK
age -d -i /tmp/clx-age.key "$NAME" | zstd -d > set.tar   # 56 MB tar
tar -xf set.tar && pg_restore --list 20261027T205026Z/db.dump | wc -l   # 97
age -d -i /tmp/clx-age.key 20261027T205026Z/env.age      # all 7 keys
shred -u /tmp/clx-age.key                                 # dump + key gone
```

That proves the whole chain: upload → storage → checksum → decryption → a dump
that `pg_restore` can list. Repeat once a year and after every key change; the
plaintext dump and the key are shredded immediately afterwards, because the dump
contains production data.

## Acceptance

```sh
/usr/local/bin/catchlogx-backup status              # sets, ages, config, timers
systemctl start catchlogx-backup.service            # one real run; then read the mail
systemctl start catchlogx-backup-probe.service      # one real rehearsal
journalctl -u catchlogx-backup -n 50 --no-pager
sudo -u clxadmin psql -U clxadmin -d postgres -c '\l'   # no clx_restore_probe left
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
  reissued (`ALTER ROLE`, `deploy/prod/postgres/readonly-role.sh`, a new
  `NEXTAUTH_SECRET` — which invalidates all sessions).
- **The scratch database costs disk.** ~114 MB while it exists; it is dropped
  in the same run, also on failure.
