# Production backup (BOKU host, #86)

Daily logical backup of the production database plus the runtime env, kept on
the host and mirrored to the VPS over SSH/port-knocking. A monthly **restore
rehearsal** proves that the newest set can actually be read back — an untested
backup is an assumption, not a backup.

## What is backed up

| Item | How | Where |
|---|---|---|
| Database `clx` (all fishing data, users, sessions, uploads, templates, file blobs) | `pg_dump -Fc` over the local socket of the native cluster | `<set>/db.dump` |
| Restorability proof / table of contents | `pg_restore --list` | `<set>/db.dump.list` |
| Row counts and `FileBlob` byte total **at dump time** | `psql` (no password: peer auth as `clxadmin`) | `<set>/rowcounts.txt` |
| `/home/clxadmin/.config/catchlogx/.env` (only copy of `DATABASE_URL`, `NEXTAUTH_SECRET`, `READONLY_DB_PASSWORD`) | `age` to the operator's public key | `<set>/env.age` |
| Checksums of the above | `sha256sum` | `<set>/SHA256SUMS` |

Not backed up on purpose: `~/releases` (reproducible from git), the
`catchlogx_clx_pgdata` volume (a logical dump is the better artifact), the
MinIO volume (obsolete, see #131), `/etc` (in `deploy/prod/` or package state).

Two artefacts leave the host per run, both from the same set: `<stamp>-boku.tar.zst`
to the institute file server (complete, env in clear text, rotated there) and
`<stamp>.tar.zst` to the VPS (complete, env only as `env.age`). See
"Institute file server" and "Off-site transport".

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
| `catchlogx-boku-mount` + `catchlogx-boku-umount` | `/usr/local/bin/` | `755 root:root` |
| `catchlogx-backup-smb.sudoers` | `/etc/sudoers.d/catchlogx-backup-smb` | `440 root:root` |
| `tmpfiles-catchlogx-boku.conf` | `/etc/tmpfiles.d/catchlogx-boku.conf` | `644 root:root` |
| `catchlogx-smb.cred.example` | `/etc/catchlogx-smb.cred` (filled in) | `600 root:root` |

Packages: `age` (`apt install age`), `zstd`, `rsync`, `cifs-utils` (`apt install cifs-utils`,
for the institute file server, #86), `postgresql-client-16` (from PGDG, matching the
cluster), `postfix` (see `../postfix/`), and the knock
**client** — `apt install knockd` ships `/usr/bin/knock`, the daemon is not
needed here (mask it, see "Off-site transport" below). Runner: the units run as
`clxadmin` because the native cluster maps that OS user to the DB role
`clxadmin` via `local all clxadmin peer` in `pg_hba.conf` (#170) — that is what
makes `pg_dump`/`psql`/`pg_restore` work without any password.
`EnvironmentFile` is read by systemd as root, so secrets stay unreadable for the
backup user.

## Install

```sh
install -m 755 deploy/prod/backup/backup.sh /usr/local/bin/catchlogx-backup
install -m 755 deploy/prod/backup/catchlogx-boku-mount \
                deploy/prod/backup/catchlogx-boku-umount /usr/local/bin/
install -m 644 deploy/prod/backup/catchlogx-backup.service \
             deploy/prod/backup/catchlogx-backup.timer \
             deploy/prod/backup/catchlogx-backup-probe.service \
             deploy/prod/backup/catchlogx-backup-probe.timer \
             deploy/prod/backup/catchlogx-alert@.service /etc/systemd/system/
install -m 644 deploy/prod/backup/tmpfiles-catchlogx-boku.conf /etc/tmpfiles.d/catchlogx-boku.conf
install -m 440 deploy/prod/backup/catchlogx-backup-smb.sudoers /etc/sudoers.d/catchlogx-backup-smb
install -m 600 deploy/prod/backup/catchlogx-backup.env.example /etc/catchlogx-backup.env
install -m 600 deploy/prod/backup/catchlogx-smb.cred.example /etc/catchlogx-smb.cred
$EDITOR /etc/catchlogx-backup.env       # MAIL_TO, age recipient, off-site, SMB (see below)
$EDITOR /etc/catchlogx-smb.cred         # the service account's SMB password
visudo -cf /etc/sudoers.d/catchlogx-backup-smb
systemd-tmpfiles --create /etc/tmpfiles.d/catchlogx-boku.conf
systemctl daemon-reload
systemctl enable --now catchlogx-backup.timer catchlogx-backup-probe.timer
```

## Daily run (`catchlogx-backup run`, 02:30 UTC ±15 min)

1. `pg_dump -Fc` → `db.dump`, then `pg_restore --list` — a dump that cannot be
   listed is treated as a failure and the set is discarded.
2. Row counts (`User`, `Session`, `PasswordResets`, `Imports`, `TemplateFiles`,
   `FileBlob`, `UserQueries`, `fish_*`, `river_sites`, `samplings`) plus
   `sum(length("FileBlob".data))` are frozen into `rowcounts.txt`. The restore
   probe compares against **these** numbers, never against live production.
3. `.env` → `env.age` (public key only; nothing to decrypt on this host).
4. **Institute file server (#86)**: the set is rebuilt as `<stamp>-boku.tar.zst`
   — `db.dump`, `db.dump.list`, `rowcounts.txt`, `SHA256SUMS` and the runtime env
   **in clear text** as `env.plaintext` (see "Institute file server" below). The
   share is mounted for exactly this step, the archive is pushed with `rsync -c`,
   read back from the share and verified with `sha256sum -c`, the drive's own
   rotation runs, the inventory is written to the log, and the share is unmounted
   again — also on failure, via a trap. Skipped when `SMB_HOST` is empty.
5. Off-site: the set becomes one `tar.zst` (plain, #192) **including `env.age`**,
   the sender knocks the VPS SSH port open and pushes archive + `.sha256` with
   `rsync -c`. rsync verifies the transferred file with its own checksums; the
   receiving side re-hashes it nightly and the dev restore verifies it before
   use. Three attempts, each with a fresh knock. Skipped with a warning when
   `OFFSITE_HOST` is empty.
6. Prune (local): newest `KEEP_DAILY` sets, plus the 1st-of-month sets (up to
   `KEEP_MONTHLY`). Hand-made sets (`cutover-…`, `pre-apt-…`) are never removed.
7. One report per run. By default it is delivered **locally** into
   `/var/mail/root` (read with `mail -u root`) — the host's own mailbox, no
   external account, no SMTP round trip. See "Reports" below. Failures go
   through `catchlogx-alert@…` (systemd `OnFailure`), which mails the journal
   tail of the failing unit to the same place.

## Institute file server (SMB, #86)

The primary archive is a home directory on the institute's NSS volume:

```
//serverhome.boku.ac.at/DATAHOME/home/ihyam_catchlogx      (20 GB, extendable)
```

The account is the BOKU service account `ihyam_catchlogx` — the same one the
mail relay uses (`../postfix/`), same password. Credentials live in
`/etc/catchlogx-smb.cred` (`600 root:root`, `username=`/`password=`), read only
by the root-side mount helper: the backup runs as `clxadmin` and never sees the
password. Verify the account from any machine in the BOKU net with

```sh
smbclient -L //serverhome.boku.ac.at -U 'ihyam_catchlogx%<password>' -m SMB3
```

SMB1 is disabled on the server, so the mount uses `vers=3.1.1` with `3.0` as the
fallback.

### The mount exists only during the sync

`clxadmin` has no sudo rights at all (hardening 2026-10-29) — the single
exception is this mount, and it is deliberately narrow:

- `/usr/local/bin/catchlogx-boku-mount` and `-umount` are fixed-argument shell
  scripts (source, mountpoint, credentials and options are hardcoded in the
  repo copy); the sudoers rule allows **exactly these two** paths.
- The mountpoint is `/run/catchlogx-boku`, created by
  `/etc/tmpfiles.d/catchlogx-boku.conf` — `/run` means a reboot always starts
  unmounted.
- `backup.sh` mounts right before the upload and unmounts from a `trap` on
  `EXIT`, `INT` and `TERM`, so a failed run, a `die` or a systemd timeout cannot
  leave the share mounted. `catchlogx-backup status` shows `GERADE GEMOUNTET`
  if something ever does.

Mount options: `credentials=…,vers=3.1.1,uid=clxadmin,gid=clxadmin,
file_mode=0640,dir_mode=0750,nosuid,nodev,noexec,iocharset=utf8`.

### What lands there

`<stamp>-boku.tar.zst` + `.sha256`, containing `db.dump`, `db.dump.list`,
`rowcounts.txt`, `SHA256SUMS` and **`env.plaintext`** — the runtime env in clear
text, mode 600 inside the archive.

This is a deliberate decision (2026-11-16, `docs/ai/DECISIONS.md`): **nothing
encrypted is written to the institute server**, and the drive copy is the only
one that can be restored without the age key. The price is that
`NEXTAUTH_SECRET`, `DATABASE_URL`/`READONLY_DB_PASSWORD` sit in clear text on a
server administered by the OE — and, because the drive keeps a year of history,
a rotated password stays readable there until its set ages out.

The name carries `-boku` on purpose: the VPS copy (`<stamp>.tar.zst`) contains
`env.age` instead of `env.plaintext`, and the two must never be confused.

### Rotation on the drive

`SMB_KEEP_DAILY` (12) newest sets plus the 1st-of-month sets up to
`SMB_KEEP_MONTHLY` (12) stay; everything else is deleted **as a pair**
(`.tar.zst` + `.sha256`), never a file without its checksum. Hand-made sets
(`cutover-…`, `pre-apt-…`) do not match the pattern and are never touched.
Before the upload the script checks free space and rotates first if the new
archive would not fit.

Every run writes the resulting inventory to the journal — the mount exists only
during the run, so this is the only moment it can be observed:

```
smb: vorhanden 20261116T023012Z-boku.tar.zst (19MB, 2026-11-16T02:33Z)
smb: 12 Sätze auf dem Drive, 228MB gesamt
```

On demand, without a backup run: `catchlogx-backup smb-ls` (mounts, lists,
unmounts).

### Restore from the institute file server

The drive copy needs no key — that is its point:

```sh
# on any machine with access to the share (BOKU net or VPN)
smbclient //serverhome.boku.ac.at/DATAHOME -U 'ihyam_catchlogx%<password>' -m SMB3 \
  -c 'cd home\ihyam_catchlogx; get 20261116T023012Z-boku.tar.zst'
sha256sum -c 20261116T023012Z-boku.tar.zst.sha256
tar -xf 20261116T023012Z-boku.tar.zst && cd 20261116T023012Z
pg_restore --list db.dump | wc -l            # restorability proof
cat env.plaintext                            # DATABASE_URL, NEXTAUTH_SECRET, …
```

Then follow "Manual restore (disaster)" below; the env does not have to be
reissued. Shred the extracted plaintext files afterwards — the dump contains
production data and `env.plaintext` the production secrets.

## Off-site transport: knock + rsync (#192)

The dev VPS (`claw`, `catchlogx.graf.priv.at`) keeps its SSH port closed until
the sender knocks (#189). The archive is pushed as the unprivileged user
`catchlogx` into `~/backups` there. One-time setup on the production host:

```sh
# 1. the knock client. The package also contains the daemon - mask it, this
#    host must never run one.
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends knockd
systemctl disable --now knockd && systemctl mask knockd
which knock        # /usr/bin/knock

# 2. the upload key (no passphrase: systemd has no agent)
ssh-keygen -t ed25519 -N '' -C clxadmin@clx-prod -f /home/clxadmin/.ssh/catchlogx-offsite
chown clxadmin:clxadmin /home/clxadmin/.ssh/catchlogx-offsite*
chmod 600 /home/clxadmin/.ssh/catchlogx-offsite

# 3. pin the host key instead of answering "yes" blindly (fingerprint in
#    PITFALLS.md). Run this as clxadmin, not root - the file must end up in
#    clxadmin's known_hosts.
ssh-keyscan -t ed25519 claw.graf.priv.at >> /home/clxadmin/.ssh/known_hosts

# 4. put the public key into ~catchlogx/.ssh/authorized_keys on the VPS, with
#    the forced command from deploy/vps/offsite-backup/README.md:
#      command="/usr/bin/rrsync -wo -no-del -no-overwrite /home/catchlogx/backups",restrict,from="141.244.222.191"

# 5. fill the knobs and run once
$EDITOR /etc/catchlogx-backup.env     # OFFSITE_HOST, OFFSITE_SSH_KEY, OFFSITE_KNOCK_PORTS (secret!)
systemctl start catchlogx-backup.service
journalctl -u catchlogx-backup -n 20 --no-pager
```

**Quote every value that contains a space** (`OFFSITE_KNOCK_PORTS="1234 5678 9012"`).
systemd's `EnvironmentFile` keeps an unquoted value together, but `backup.sh`
also **sources** this file for manual runs (`status`, `probe`, `keycheck`) — an
unquoted port list makes bash execute the second port as a command and the
diagnostic dies with `36291: command not found` (found and fixed on the host on
2026-11-15, #220).

The knock sequence is a **secret**: it lives only in `/etc/catchlogx-backup.env`
(root, 0600) and must never appear in the repo, an issue, a commit message or a
log. The script knocks before every attempt because the daemon closes the port
again after ~30 s; an already established transfer keeps running.

On the receiving side nothing needs root: directory, script and timer belong to
`catchlogx`. See `deploy/vps/offsite-backup/README.md`.



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

The `age` identity is the recovery key for `env.age` — the only part of the
backup that is still encrypted (the database archive travels in clear text
since #192). It **must not** live on the host: a key on the machine encrypts
nothing for whoever holds the machine. On the operator's machine it lives in
`pass` as `boku/age` (the public half, `age1…`, is in `BACKUP_AGE_RECIPIENT`).

```sh
# the identity never touches the host and never gets printed
pass show boku/age > /tmp/clx-age.key && chmod 600 /tmp/clx-age.key
```

Rehearsed end to end on **2026-10-27** (age-encrypted archive, pulled back from
the VPS). The read-back chain is unchanged for `env.age`:

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

Since #192 the archive itself no longer needs the key: `tar -x` +
`pg_restore --list` are enough to prove the dump. Only `env.age` still requires
`pass show boku/age`. Repeat once a year and after every key change; the
plaintext dump and the key are shredded immediately afterwards, because the dump
contains production data.

## Acceptance

```sh
/usr/local/bin/catchlogx-backup status              # sets, ages, config, timers
/usr/local/bin/catchlogx-backup smb-ls              # what is on the institute drive
systemctl start catchlogx-backup.service            # one real run; then read the mail
systemctl start catchlogx-backup-probe.service      # one real rehearsal
journalctl -u catchlogx-backup -n 50 --no-pager
sudo -u clxadmin psql -U clxadmin -d postgres -c '\l'   # no clx_restore_probe left
mountpoint -q /run/catchlogx-boku && echo "LEAK: Share noch gemountet"
```

## Known limits

- **RPO 24 h.** One dump per day; there is no WAL archiving, so a crash at 02:29
  loses the previous day. Point-in-time recovery would need `pg_basebackup` +
  archive_command (own ticket).
- **The VPS copy is not encrypted (#192), the drive copy is not either — by
  decision.** The dump on the VPS is readable for `catchlogx` (and root) —
  accepted, because the dev instance restores it and then holds the same data
  anyway; the production secrets stay in `env.age` inside that archive. The
  institute drive holds `env.plaintext` on purpose (2026-11-16, see above) —
  the trade-off is the year of history that keeps rotated secrets readable.
- **The drive copy is the complete one, the VPS copy the encrypted one.** A
  restore from the VPS needs `pass show boku/age`; a restore from the drive
  needs nothing but the share. Neither replaces the other: the drive sits in the
  same institute as production, the VPS is geographically separate.
- **`env.age` is only as good as the key copy.** Lose the identity and the env
  backup is worthless; the database dump stays readable, and the secrets can be
  reissued (`ALTER ROLE`, `deploy/prod/postgres/readonly-role.sh`, a new
  `NEXTAUTH_SECRET` — which invalidates all sessions).
- **The scratch database costs disk.** ~114 MB while it exists; it is dropped
  in the same run, also on failure.
