# Node runtime of the app (`~/tools/node`) (#172)

The production app does **not** use a system Node, and it does not use the
runner's Node either. It runs on a Node distribution unpacked in `clxadmin`'s
home:

```
/home/clxadmin/tools/node -> /home/clxadmin/tools/node-v22.23.3   (symlink)
```

| Consumer | Interpreter | Where it comes from |
|---|---|---|
| `catchlogx.service` (the app) | `~/tools/node/bin/node` | hardcoded `ExecStart=` in `systemd/catchlogx.service` |
| interactive `clxadmin` shell | same | `shell/node-path.sh` → `~/.config/catchlogx/path.sh`, sourced from `~/.profile` |
| the Actions runner | `~/actions-runner/externals/node24/bin/node` | ships with the runner (`runsvc.sh`), independent |
| deploy job build steps | `_work/_tool/node/<ver>/` | `actions/setup-node`, cached per job, ephemeral |

**Version: Node v22.23.3, npm 10.9.9** (verified 2026-10-29). The app is a
`next start` standalone bundle — it needs no compiler and no `node-gyp`, only a
recent runtime (Next 16 wants a current 20.x/22.x line).

## Why not `/usr/local/bin/node` or apt

Both need root, and #122 moved every `clxadmin` artefact into the home on
purpose: the account is unprivileged, so its runtime must be too. A distro
package would also couple the app to the Ubuntu release cycle (`resolute`), and
an app upgrade would become a system upgrade.

## Upgrading

The symlink is the seam — the unit and the shell snippet both go through it, so
a Node bump is two commands and a restart, with the old version still on disk
for a rollback:

```sh
# as clxadmin, from ~/tools
cd ~/tools
curl -fsSLO https://nodejs.org/dist/v22.<X>.<Y>/node-v22.<X>.<Y>-linux-x64.tar.xz
tar -xf node-v22.<X>.<Y>-linux-x64.tar.xz           # -> node-v22.<X>.<Y>/
ln -sfn ~/tools/node-v22.<X>.<Y> ~/tools/node       # atomic switch
node -v                                              # login shell: must match
systemctl --user restart catchlogx.service
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/upload
```

Rollback = point the symlink back at the previous `node-v*` directory and
restart. Keep the old directory until the new release has run for a while.

## Verifying the wiring

```sh
# login shell (ssh runs non-login by default, hence -l)
ssh -l clxadmin catchlogx-server 'bash -lc "command -v node npm npx && node -v"'
# -> /home/clxadmin/tools/node/bin/... and v22.23.3, PATH entry exactly once
```
