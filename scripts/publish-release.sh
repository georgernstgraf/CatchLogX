#!/usr/bin/env bash
# Publish a built Next.js standalone bundle as an immutable release (#135).
#
# Usage: scripts/publish-release.sh <commit-sha>     (run from the repo root, after `npm run build`)
#
# Produces:
#   ~/releases/<sha>/               standalone bundle (server.js, node_modules, .next)
#   ~/current -> ~/releases/<sha>   atomically switched symlink (last step)
#
# Deploy = publish a new release + `systemctl --user restart catchlogx.service`.
# Rollback = point ~/current at the previous release directory and restart.
set -euo pipefail

SHA="${1:?usage: publish-release.sh <commit-sha>}"
ROOT="$(git rev-parse --show-toplevel)"
RELEASES="$HOME/releases"
REL="$RELEASES/$SHA"
KEEP="${KEEP_RELEASES:-5}"

if [ ! -d "$ROOT/.next/standalone" ]; then
  echo "error: .next/standalone missing - build with output: 'standalone' first" >&2
  exit 1
fi

echo "Publishing release $SHA -> $REL"
rm -rf "$REL"
mkdir -p "$REL/.next"

# Standalone bundle: server.js + traced node_modules + .next server files.
cp -a "$ROOT/.next/standalone/." "$REL/"

# Static assets are not part of the standalone bundle and must be copied in.
cp -a "$ROOT/.next/static" "$REL/.next/static"
if [ -d "$ROOT/public" ]; then
  cp -a "$ROOT/public" "$REL/public"
fi

# Switch the symlink atomically (create temp link, then rename over the old one).
ln -sfn "$REL" "$RELEASES/.current.tmp"
mv -Tf "$RELEASES/.current.tmp" "$HOME/current"

# Prune old releases, keeping the newest $KEEP (the release just published is newest).
find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -rn | tail -n "+$((KEEP + 1))" | cut -d' ' -f2- | xargs -r rm -rf

echo "Done: ~/current -> $REL"
