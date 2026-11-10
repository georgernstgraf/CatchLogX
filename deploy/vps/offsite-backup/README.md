# Off-site backups on the dev VPS (`claw`, #86 / #192)

The BOKU host pushes one archive per day into the home of the unprivileged user
`catchlogx`. This directory holds the receiving side: the `authorized_keys`
shape, the rotation/integrity timer and the notes that keep the setup honest.

Layout on the host:

| Path | Owner | Mode | Purpose |
|---|---|---|---|
| `/home/catchlogx/backups/` | `catchlogx` | `0700` | the archives, one `tar.zst` + `.sha256` per day |
| `/home/catchlogx/catchlogx-offsite-prune.sh` | `catchlogx` | `0755` | rotation + integrity check |
| `~/.config/systemd/user/catchlogx-offsite-prune.{service,timer}` | `catchlogx` | `0644` | daily run at 03:30 UTC |

Since #192 the archive is a **plain `tar.zst`** (`db.dump`, `db.dump.list`,
`rowcounts.txt`, `SHA256SUMS`, `env.age`). The database dump is therefore
readable on this machine - deliberate, because the dev instance restores it and
then holds the same data in its own database anyway. Only `env.age` (the
production `DATABASE_URL`, `NEXTAUTH_SECRET`, `READONLY_DB_PASSWORD`) is still
encrypted with the operator's age key, which never leaves the operator.

## Receiving side: SSH with a forced `rrsync`

The SSH port is closed until the sender knocks (#189). The key is restricted to
a write-only rsync into exactly this directory, so a compromised production
host cannot get a shell here - it could only drop files:

```
# ~catchlogx/.ssh/authorized_keys
command="/usr/bin/rrsync -wo -no-del -no-overwrite /home/catchlogx/backups",restrict,from="141.244.222.191" ssh-ed25519 AAAA... clxadmin@clx-prod
```

- `-wo` = write-only (no downloads), `-no-del` = the key can never delete an
  archive, `-no-overwrite` = a verified upload cannot be replaced.
- `restrict` disables forwarding, agent and pty; `from=` pins the BOKU host.
- Test both directions before trusting it:
  - `ssh -i ~/.ssh/catchlogx-offsite catchlogx@claw.graf.priv.at 'id'` must be
    refused (no shell),
  - `rsync --delete …` must be refused (no deletes),
  - a normal `rsync -c <file> catchlogx@claw:` must work.

Why not plain `scp`: a shell as `catchlogx` is not a privilege escalation to
root (the user has no sudo on this host), but it is the account that runs the
app, the CI runner and the dev database's superuser role. A key that only drops
files into one directory is the smaller surface. `rrsync` is the cheapest way to
get that - it ships with the `rsync` package (`/usr/bin/rrsync`).

The old HTTPS path is gone with #192: the nginx `/backup/` location, its
`dav_methods PUT`, and `/etc/nginx/catchlogx-backup.htpasswd` were removed. If
you ever need it back, it is in git history before this commit - but it writes
into the directory as `www-data`, which is exactly the ownership mess the SSH
path fixed.

## Install / update

```sh
# as catchlogx
install -m 755 deploy/vps/offsite-backup/catchlogx-offsite-prune.sh ~/catchlogx-offsite-prune.sh
install -m 644 deploy/vps/offsite-backup/catchlogx-offsite-prune.service \
             deploy/vps/offsite-backup/catchlogx-offsite-prune.timer \
             ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now catchlogx-offsite-prune.timer
systemctl --user list-timers catchlogx-offsite-prune.timer
```

The timer used to be a root system unit. If it is still installed on a host,
disable it once (`sudo systemctl disable --now catchlogx-offsite-prune.timer`,
`sudo rm /etc/systemd/system/catchlogx-offsite-prune.*`) - two rotation jobs on
the same directory would race.

## Day-to-day

```sh
ls -l ~/backups                          # newest first by mtime
sha256sum -c --quiet ~/backups/*.sha256  # re-hash everything
systemctl --user start catchlogx-offsite-prune.service && journalctl --user -n 20
```

Legacy `*.tar.zst.age` archives are still rotated by the same script; they
disappear on their own once seven plaintext archives exist. They are the only
off-site copies of the days before #192, so do not delete them by hand earlier.

## Failure modes worth knowing

- **Nothing arrives** (upload broken): the newest archive ages, but nothing is
  deleted - rotation only removes sets when newer ones exist. `catchlogx-backup
  status` on the BOKU host is the first place to look, the journal here the
  second.
- **A corrupted upload**: the nightly check re-hashes the newest archive against
  its `.sha256` and fails loudly in the user journal. There is no alerting on
  this host - nobody is paged.
- **The knock window (30 s)**: the sender knocks before every upload attempt.
  A transfer that starts inside the window keeps running after the rule is
  removed (the connection is established), but a retry needs a fresh knock.
