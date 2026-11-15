#!/usr/bin/env bash
# Refresh the vendored engineering skills from upstream mattpocock/skills.
# Run when you want to pull in upstream changes; review the diff before committing.
set -euo pipefail

SRC_REPO="https://github.com/mattpocock/skills.git"
ROOT="$(git rev-parse --show-toplevel)"
DEST="$ROOT/.opencode/skills/engineering"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Cloning $SRC_REPO (shallow)..."
git clone --depth 1 "$SRC_REPO" "$TMP"

echo "Syncing skills/engineering/ -> $DEST ..."
rsync -a --delete "$TMP/skills/engineering/" "$DEST/"

echo "Done. Review with: git diff .opencode/skills/engineering"
