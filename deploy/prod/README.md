# Production host (BOKU) — machine configuration

Versioned copies of the configuration that lives on the production machine
(`catchlogx-server`, `141.244.222.191`). The host has no SVN checkout and no
route to the SVN server (no VPN/tunnel into the BOKUnet is allowed, see #115),
so `EDV/Deployed/<host>` in the SVN knowledge tree cannot hold these files —
they are kept here instead. **No secrets** belong in this directory: the
runtime env stays in `/opt/CatchLogX/.env` (mode 600) on the machine.

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
