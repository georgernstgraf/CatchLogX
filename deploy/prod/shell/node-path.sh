# Node toolchain of the CatchLogX app runtime (#172).
#
# Target on the host: /home/clxadmin/.config/catchlogx/path.sh
# Sourced from ~clxadmin/.profile (see deploy/prod/README.md).
#
# The systemd units do NOT read this file: catchlogx.service references
# /home/clxadmin/tools/node/bin/node directly in ExecStart, and the runner
# carries its own interpreter in ~/actions-runner/externals. This snippet only
# makes the app's own interpreter (plus npm/npx) available to an interactive
# clxadmin shell - so the account that owns the runtime can operate it, e.g.
# `cd ~/src/CatchLogX && npx prisma migrate status`.
#
# No root, nothing outside the home: consistent with the hardening of #122.
# Guarded so that repeated sourcing does not grow PATH.
case ":$PATH:" in
  *":$HOME/tools/node/bin:"*) ;;
  *) PATH="$HOME/tools/node/bin:$PATH"; export PATH ;;
esac
