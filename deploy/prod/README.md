# Production host (BOKU) — machine configuration

Versioned copies of the configuration that lives on the production machine
(`catchlogx-server`, `141.244.222.191`). There is no VPN/tunnel into the BOKUnet
(see #115) and the host has no SVN checkout, so `EDV/Deployed/<host>` in the SVN
knowledge tree cannot hold these files — they are kept here instead. **No
secrets** belong in this directory: the runtime env stays in
`/opt/CatchLogX/.env` (mode 600) on the machine, the SMTP credential in
`/etc/postfix/sasl_passwd`, and the backup secrets in
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

## Files and their target on the host

| File here | Target on the host | Mode |
|---|---|---|
| `netplan/00-installer-config.yaml` | `/etc/netplan/00-installer-config.yaml` | `600 root:root` |
| `chrony/10-boku.sources` | `/etc/chrony/sources.d/10-boku.sources` | `644 root:root` |
| `nginx/sites-available/catchlogx` | `/etc/nginx/sites-available/catchlogx` (+ symlink in `sites-enabled/`) | `644 root:root` |
| `nginx/99-catchlogx-address.conf` | `/etc/systemd/system/nginx.service.d/99-catchlogx-address.conf` | `644 root:root` |
| `systemd/99-any-link.conf` | `/etc/systemd/system/systemd-networkd-wait-online.service.d/99-any-link.conf` | `644 root:root` |
| `systemd/catchlogx.service` | `~clxadmin/.config/systemd/user/catchlogx.service` | `644 clxadmin:clxadmin` |
| `postfix/main.cf.nondefault` + `postfix/README.md` | applied by hand (`postconf -e`), see that README | – |
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

Not managed here: the Actions runner (`actions.runner.AlphaVIE-CatchLogX.catchlogx-server.service`,
system service, outbound only), `docker`/`clx-postgres`, and the release tree
under `~clxadmin` (created by `.github/workflows/production-deploy.yml`).

## Mail and backup

Two additions from 2026-10-27 that are not part of the web topology:

- `postfix/` — the host runs a loopback-only postfix (`127.0.0.1:25`) that
  relays authenticated to the BOKU smarthost. It exists because the BOKUnet
  blocks every SMTP port except 25 to BOKU's own mail servers; see
  `postfix/README.md`.
- `backup/` — daily `pg_dump` + encrypted env + off-site upload, with a monthly
  restore rehearsal. Runs as `clxadmin` (docker group), config in
  `/etc/catchlogx-backup.env`; see `backup/README.md`.

The VPS side of the off-site path (nginx PUT endpoint, rotation timer) lives in
`deploy/vps/offsite-backup/`.

## Database query observability (#169)

PostgreSQL settings are **not** part of this directory: they live inside the
data volume (`postgresql.auto.conf`) and are applied by the gated
`db-observability` job in `production-maintenance.yml` (or by hand with
`docker exec -i clx-postgres psql … < deploy/postgres/observability.sql`).
Settings, analysis queries and the rollback recipe are in
[`../postgres/README.md`](../postgres/README.md).

The job restarts `clx-postgres` **once** (postmaster settings cannot be applied
otherwise: `shared_preload_libraries`, `logging_collector`). It backs up
`postgresql.auto.conf` first and restores it automatically if the container does
not come up. Logs then live in `<PGDATA>/log` inside the volume, not in
`docker logs`.
