# Production host (BOKU) — machine configuration

Versioned copies of the configuration that lives on the production machine
(`catchlogx-server`, `141.244.222.191`). There is no VPN/tunnel into the BOKUnet
(see #115) and the host has no SVN checkout, so `EDV/Deployed/<host>` in the SVN
knowledge tree cannot hold these files — they are kept here instead. **No
secrets** belong in this directory: the runtime env stays in
`/home/clxadmin/.config/catchlogx/.env` (mode 600) on the machine, the SMTP
credential in `/etc/postfix/sasl_passwd`, and the backup secrets in
`/etc/catchlogx-backup.env`.

Since 2026-10-27 there is direct `root` SSH access with a personal key (#115
keeps the open question with the OE whether that stays).

Synced by hand on **2026-10-27** during #164 (address correction + nginx in
front of the app). The files are copies, not a deployment mechanism: they are
applied by hand over SSH, so a change here must be mirrored on the host (and
vice versa).

## Topology

```
Internet / BOKUnet
  │
  ├─ http://141.244.222.191:3001/…  → nginx  → 301 → http://<host>/…   (old bookmarks)
  └─ http://141.244.222.191/…       → nginx  → proxy_pass → 127.0.0.1:3001 (Next.js)

PostgreSQL 16 (native, since #170)
  ├─ 127.0.0.1:5432 + unix socket → app (clxadmin, scram) and host tooling (peer)
  └─ 0.0.0.0:5432 → research group (clx_readonly, scram, TLS offered)
```

- The app (`catchlogx.service`, user unit of `clxadmin`) binds **only**
  `127.0.0.1:3001`; it is not reachable from the network any more.
- The `:3001` listener is bound to the **public address** on purpose: the app
  owns `127.0.0.1:3001`, and `0.0.0.0:3001` would collide with it
  (`EADDRINUSE`). Two sockets on the same port are fine as long as the
  addresses differ (verified on the host).
- Because nginx binds a fixed address, it must start **after** the address
  exists → the systemd drop-in orders it after `network-online.target` and
  retries on failure.
- Uploads: `client_max_body_size 550m` and `600s` proxy timeouts mirror the app
  limits (#132); the nginx default (`1m`) would turn a bulk upload into a 413
  before the app sees it.
- Health checks in the workflows still probe `127.0.0.1:3001` (the app
  directly), so they do not depend on nginx.

## Checking prod by hand (#172)

No wrapper, no script — four commands answer "what is deployed and does the
schema match?". They run as `clxadmin` over SSH; `git`/`node`/`npm`/`npx` are
available in a **login** shell (`ssh … 'bash -lc "…"'`).

```sh
# 1. what is running, and is the checkout older than the deployment?
readlink -f ~/current                    # ~/releases/<full-sha>
git -C ~/src/CatchLogX rev-parse HEAD    # clone (tracks master, like prod)
git -C ~/src/CatchLogX log --oneline $(basename $(readlink -f ~/current))..HEAD

# 2. does the schema match the checkout? (Prisma reads .env from the cwd)
cd ~/src/CatchLogX && git pull --ff-only   # + `npm ci` only if package-lock changed
npx prisma migrate status                  # "Database schema is up to date!"
```

`~/src/CatchLogX` is a **hand-maintained diagnosis clone**, not a deployment
source: it tracks `master` (prod runs `master`; `dev` has migrations that are
not released yet and would show up as bogus "pending"), and its `.env` is a
symlink to `~/.config/catchlogx/.env` so there is only one copy of the DB
password. Deploys still come from the runner, never from this clone.

Why this clone and not `psql`: `prisma migrate status` compares
`prisma/migrations/` against `_prisma_migrations` **in the checkout that matches
the running release**, which is exactly the question. `psql -c 'select * from
_prisma_migrations'` answers only half of it. Node itself: see
[`node/README.md`](node/README.md).

## Files and their target on the host

| File here | Target on the host | Mode |
|---|---|---|
| `netplan/00-installer-config.yaml` | `/etc/netplan/00-installer-config.yaml` | `600 root:root` |
| `chrony/10-boku.sources` | `/etc/chrony/sources.d/10-boku.sources` | `644 root:root` |
| `nginx/sites-available/catchlogx` | `/etc/nginx/sites-available/catchlogx` (+ symlink in `sites-enabled/`) | `644 root:root` |
| `nginx/99-catchlogx-address.conf` | `/etc/systemd/system/nginx.service.d/99-catchlogx-address.conf` | `644 root:root` |
| `systemd/99-any-link.conf` | `/etc/systemd/system/systemd-networkd-wait-online.service.d/99-any-link.conf` | `644 root:root` |
| `systemd/catchlogx.service` | `~clxadmin/.config/systemd/user/catchlogx.service` | `644 clxadmin:clxadmin` |
| `systemd/actions.runner.AlphaVIE-CatchLogX.catchlogx-server.service` | `~clxadmin/.config/systemd/user/actions.runner.AlphaVIE-CatchLogX.catchlogx-server.service` | `644 clxadmin:clxadmin` |
| `sshd/99-catchlogx-no-password.conf` | `/etc/ssh/sshd_config.d/99-catchlogx-no-password.conf` | `644 root:root` |
| `shell/node-path.sh` | `~clxadmin/.config/catchlogx/path.sh` (+ one `source` line in `~clxadmin/.profile`) | `644 clxadmin:clxadmin` |
| `postfix/main.cf.nondefault` + `postfix/README.md` | applied by hand (`postconf -e`), see that README | – |
| `postgres/99-catchlogx.conf` | `/etc/postgresql/16/main/conf.d/99-catchlogx.conf` | `644 root:root` |
| `postgres/pg_hba.conf` | `/etc/postgresql/16/main/pg_hba.conf` | `640 postgres:postgres` |
| `postgres/provision-cluster.sh`, `make-tls-cert.sh`, `readonly-role.sh` | run from the checkout (root) | – |
| `backup/backup.sh` | `/usr/local/bin/catchlogx-backup` | `755 root:root` |
| `backup/catchlogx-*.service`, `backup/catchlogx-*.timer`, `backup/catchlogx-alert@.service` | `/etc/systemd/system/` | `644 root:root` |
| `backup/catchlogx-backup.env.example` | `/etc/catchlogx-backup.env` (filled in) | `600 root:root` |
| `mutt/muttrc` | `/root/.muttrc` | `600 root:root` |

## Apply / verify

```sh
# address (arm a rollback first - a broken netplan means no address on boot)
netplan generate && netplan apply && ip -br a show eno1

# nginx
nginx -t && systemctl reload nginx
systemctl daemon-reload && systemctl restart nginx

# app unit (as clxadmin)
systemctl --user daemon-reload && systemctl --user restart catchlogx.service

# acceptance
ss -ltnp | grep -E ':(80|3001)\b'      # nginx :80 + publicIP:3001, node 127.0.0.1:3001
curl -sS -o /dev/null -w '%{http_code}\n' http://141.244.222.191/
curl -sSI http://141.244.222.191:3001/ | head -3   # 301 -> port 80
```

Not managed here: the release tree under `~clxadmin` (created by
`.github/workflows/production-deploy.yml`), the diagnosis clone
`~/src/CatchLogX` (hand-pulled, see above), the Node distribution in
`~/tools/node` (documented in [`node/README.md`](node/README.md)) and the
stopped `clx-postgres` container (kept as a rollback path, `restart=no`).

Since **2026-10-29 (#122)** the host is hardened around one rule: **nothing of
`clxadmin` lives outside its home**.

- The Actions runner is a **user** unit of `clxadmin`
  (`~/.config/systemd/user/actions.runner.AlphaVIE-CatchLogX.catchlogx-server.service`,
  `~/actions-runner`, `Restart=always`), kept alive at boot by linger — no root
  unit, no `/opt`. Note the runner's `bin`/`externals` symlinks are **relative**
  on purpose: the absolute ones to `/opt/actions-runner` broke the first move.
- `clxadmin` is **not** in `sudo`, `docker` or `lxd`; it cannot escalate at all.
  Root SSH (key) over the BOKU VPN is the only privileged path, and the console
  password login of `root` is the break-glass fallback.
- The runtime env moved from `/home/clxadmin/.config/catchlogx/.env` to
  `~clxadmin/.config/catchlogx/.env`; the old `/root/CatchLogX` checkout is
  **deleted**. The runbook checkout is now root-owned and re-cloned on demand
  (`git clone https://github.com/georgernstgraf/CatchLogX /root/CatchLogX`).
- SSH: keys only (`PasswordAuthentication no`), for `root` *and* `clxadmin`;
  `clxadmin`'s password is locked. `root` keeps password login **on the
  console** — deliberate break-glass, do not "fix" it.

## Mail and backup

Two additions from 2026-10-27 that are not part of the web topology:

- `postfix/` — the host runs a loopback-only postfix (`127.0.0.1:25`) that
  relays authenticated to the BOKU smarthost. It exists because the BOKUnet
  blocks every SMTP port except 25 to BOKU's own mail servers; see
  `postfix/README.md`.
- `backup/` — daily `pg_dump` + encrypted env + off-site upload, with a monthly
  restore rehearsal. Runs as `clxadmin` (peer auth to the native cluster),
  config in `/etc/catchlogx-backup.env`; see `backup/README.md`.

The VPS side of the off-site path (nginx PUT endpoint, rotation timer) lives in
`deploy/vps/offsite-backup/`.

## PostgreSQL (#170)

The database is a **native cluster** (`postgresql@16-main`) since 2026-10-30 —
configuration, TLS, the maintenance window runbook and the research group's
connection details live in [`postgres/README.md`](postgres/README.md). The
cluster's settings are in `postgres/99-catchlogx.conf`
(`/etc/postgresql/16/main/conf.d/`), the access rules in `postgres/pg_hba.conf`.

Query observability (#169) is part of that configuration;
`postgres/observability-extension.sql` only creates the extension and revokes
the public grant. Analysis queries: [`../postgres/report.sql`](../postgres/report.sql).
