#!/usr/bin/env bash
# Compatibility shim (#198).
#
# The script moved to scripts/ops/publish-release.sh. `workflow_run` workflows
# are loaded from the **default branch** (`master`), not from the branch being
# deployed, so master's copy of deploy-dev.yml still calls this path while the
# checkout is a `dev` commit. Without this file the deploy dies with
# `./scripts/publish-release.sh: No such file or directory` (exit 127) — seen
# on run 43636206808.
#
# Remove once `master` carries the new path (the next dev -> master merge).
set -euo pipefail
exec "$(dirname "$0")/ops/publish-release.sh" "$@"
