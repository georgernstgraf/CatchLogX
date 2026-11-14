#!/usr/bin/env bash
#
# Legacy upload blobs: inventory, archive comparison and export (#203).
#
# The production database carries the original file of every upload as a
# `FileBlob`. Before the database is rebuilt from the `-data` files (#200),
# every blob must be provably present in `CatchLogX-Data` — either as a file
# with the same sha256, or as a fresh export.
#
# READ-ONLY. Every statement runs inside a read-only transaction
# (`default_transaction_read_only=on`); the script only ever issues SELECTs.
# It does not touch the database, the application or the release.
#
# Usage (from a machine with SSH access to the production host):
#
#   ./export-upload-blobs.sh inventory [--out DIR]
#       Query the 18 uploads, write DIR/inventory.tsv.
#
#   ./export-upload-blobs.sh compare [--inventory FILE] [--archive DIR]
#       Map every prod sha256 to a file in the data repo. Prints MATCH or
#       UNMATCHED per upload — the UNMATCHED rows are the export candidates.
#
#   ./export-upload-blobs.sh export [--inventory FILE] [--out DIR] [--all] [ID...]
#       Fetch the given blob ids (default: every UNMATCHED upload), verify the
#       sha256 against the database value and write
#       DIR/<upload-date>_<fileName>. Idempotent: an existing file with the
#       right hash is skipped. `--all` exports every upload, including the ones
#       that are byte-identical to a delivery file — the forensic archive keeps
#       the upload objects themselves, under the names the client gave them.
#
# Environment:
#   SSH_HOST   SSH config alias of the production host (default: catchlogx-boku)
#   DB         database name (default: clx)
#   EXPECT_DB  abort unless current_database() matches (default: clx)
#   ARCHIVE    CatchLogX-Data checkout (default: ~/repos/georgernstgraf/CatchLogX-Data)
#   OUT        output directory (default: ~/blob-export)
#
# Two ways to reach the database — set PROD_DSN to go direct:
#
#   PROD_DSN='postgresql://clxadmin:…@141.244.222.191:5432/clx' ./export-upload-blobs.sh inventory
#
#   With PROD_DSN unset, the script goes through SSH and runs psql on the host
#   as the postgres user (that is how the first five blobs were exported on
#   2026-11-14, CatchLogX-Data#6). The SSH user must then be able to run
#   `runuser -u postgres -- psql`, i.e. be root.
#
# Either way the session is read-only and only SELECTs are issued.

set -euo pipefail

SSH_HOST="${SSH_HOST:-catchlogx-boku}"
PROD_DSN="${PROD_DSN:-}"
DB="${DB:-clx}"
EXPECT_DB="${EXPECT_DB:-clx}"
ARCHIVE="${ARCHIVE:-$HOME/repos/georgernstgraf/CatchLogX-Data}"
OUT="${OUT:-$HOME/blob-export}"
READONLY_OPTS='-c default_transaction_read_only=on -c statement_timeout=120s'

INVENTORY=""
IDS=()
ARGS=()
ALL=0

usage() {
  sed -n '2,48p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# --- psql against production ----------------------------------------------
# Read-only by construction: the session default is a read-only transaction.
prod_psql() {
  if [ -n "$PROD_DSN" ]; then
    PGOPTIONS="$READONLY_OPTS" psql "$PROD_DSN" -At -v ON_ERROR_STOP=1 -f -
  else
    ssh -o BatchMode=yes "$SSH_HOST" \
      "PGOPTIONS='$READONLY_OPTS' runuser -u postgres -- psql -d '$DB' -At -v ON_ERROR_STOP=1 -f -"
  fi
}

guard_target() {
  local got
  got=$(prod_psql <<'SQL'
SELECT current_database() || E'|' || coalesce(inet_server_addr()::text, 'local')
       || E'|' || (SELECT count(*) FROM "Uploads");
SQL
)
  local db addr uploads
  IFS='|' read -r db addr uploads <<<"$got"
  printf 'target: %s on %s, %s uploads\n' "$db" "$addr" "$uploads"
  [ "$db" = "$EXPECT_DB" ] || die "expected database '$EXPECT_DB', got '$db' (override with EXPECT_DB)"
}

# --- inventory -------------------------------------------------------------
cmd_inventory() {
  mkdir -p "$OUT"
  local file="$OUT/inventory.tsv"
  guard_target
  {
    printf 'uploadId|blobId|fileName|state|createdAt|sizeBytes|sha256|uploadedBy\n'
    prod_psql <<'SQL'
SELECT u.id, b.id, b."fileName", u.state,
       to_char(u."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       b."sizeBytes", encode(sha256(b.data), 'hex'), u.uploaded_by
FROM "Uploads" u JOIN "FileBlob" b ON b.id = u."blobId"
ORDER BY u."createdAt", u.id;
SQL
  } >"$file"
  printf 'wrote %s (%s uploads)\n' "$file" "$(($(wc -l <"$file") - 1))"
}

# --- archive index ---------------------------------------------------------
declare -A ARCHIVE_BY_HASH=()

index_archive() {
  [ -d "$ARCHIVE" ] || die "archive not found: $ARCHIVE (set ARCHIVE=...)"
  local f h
  while IFS= read -r -d '' f; do
    h=$(sha256sum "$f" | cut -d' ' -f1)
    ARCHIVE_BY_HASH["$h"]="${f#"$ARCHIVE"/}"
  done < <(find "$ARCHIVE" -type f -name '*.xlsx' -print0)
  [ "${#ARCHIVE_BY_HASH[@]}" -gt 0 ] || die "no .xlsx files under $ARCHIVE"
}

# Prints one line per upload: uploadId, blobId, fileName, state, sha256, archive path or UNMATCHED.
classify() {
  local file="$1"
  local id blob name state created sha
  while IFS='|' read -r id blob name state created _ sha _; do
    [ "$id" = "uploadId" ] && continue
    if [ -n "${ARCHIVE_BY_HASH[$sha]:-}" ]; then
      printf '%s|%s|%s|%s|%s|%s\n' "$id" "$blob" "$name" "$state" "$sha" "${ARCHIVE_BY_HASH[$sha]}"
    else
      printf '%s|%s|%s|%s|%s|%s\n' "$id" "$blob" "$name" "$state" "$sha" "UNMATCHED"
    fi
  done <"$file"
}

cmd_compare() {
  index_archive
  local id blob name state sha path unmatched=0
  printf '%-26s %-40s %-10s %-12s %s\n' UPLOAD FILE STATE SHA256 ARCHIVE
  while IFS='|' read -r id blob name state sha path; do
    printf '%-26s %-40s %-10s %-12s %s\n' "$id" "$name" "$state" "${sha:0:12}…" "$path"
    [ "$path" = "UNMATCHED" ] && unmatched=$((unmatched + 1))
  done < <(classify "$INVENTORY")
  printf '\n%s unmatched\n' "$unmatched"
}

# --- export ----------------------------------------------------------------
export_one() {
  local blob="$1" name="$2" created="$3" want="$4"
  local target="$OUT/${created%%T*}_${name}"
  if [ -f "$target" ]; then
    local have
    have=$(sha256sum "$target" | cut -d' ' -f1)
    if [ "$have" = "$want" ]; then
      printf '  %-58s already exported, hash ok\n' "$(basename "$target")"
      return 0
    fi
    die "$target exists with a different hash — refusing to overwrite"
  fi
  printf '  %-58s fetching…' "$(basename "$target")"
  local tmp="$target.part"
  rm -f "$tmp"
  if ! prod_psql <<SQL | base64 -d >"$tmp"
SELECT encode(data, 'base64') FROM "FileBlob" WHERE id = '$blob';
SQL
  then
    rm -f "$tmp"
    die "fetch failed for $blob"
  fi
  local got
  got=$(sha256sum "$tmp" | cut -d' ' -f1)
  if [ "$got" != "$want" ]; then
    rm -f "$tmp"
    die "hash mismatch for $blob: expected $want, got $got"
  fi
  mv "$tmp" "$target"
  printf ' ok (%s bytes)\n' "$(stat -c%s "$target")"
}

cmd_export() {
  mkdir -p "$OUT"
  guard_target
  local -A wanted=()
  local id blob
  if [ "$ALL" = 1 ]; then
    while IFS='|' read -r id blob _; do
      [ "$id" = "uploadId" ] && continue
      wanted[$blob]=1
    done <"$INVENTORY"
  elif [ "${#IDS[@]}" -gt 0 ]; then
    for id in "${IDS[@]}"; do wanted[$id]=1; done
  else
    index_archive
    while IFS='|' read -r id blob _ _ _ path; do
      [ "$path" = "UNMATCHED" ] && wanted[$blob]=1
    done < <(classify "$INVENTORY")
  fi
  [ "${#wanted[@]}" -gt 0 ] || { printf 'nothing to export — every blob matches the archive\n'; return 0; }

  printf 'exporting %s blob(s) to %s\n' "${#wanted[@]}" "$OUT"
  local name state created sha
  while IFS='|' read -r id blob name state created _ sha _; do
    [ "$id" = "uploadId" ] && continue
    [ -n "${wanted[$blob]:-}" ] || continue
    export_one "$blob" "$name" "$created" "$sha"
  done <"$INVENTORY"
}

# --- main ------------------------------------------------------------------
CMD="${1:-}"
[ -n "$CMD" ] || usage 1
shift

while [ $# -gt 0 ]; do
  case "$1" in
  --out) OUT="$2"; shift 2 ;;
  --inventory) INVENTORY="$2"; shift 2 ;;
  --archive) ARCHIVE="$2"; shift 2 ;;
  --all) ALL=1; shift ;;
  -h | --help) usage 0 ;;
  *) ARGS+=("$1"); shift ;;
  esac
done

INVENTORY="${INVENTORY:-$OUT/inventory.tsv}"

case "$CMD" in
inventory) cmd_inventory ;;
compare) [ -f "$INVENTORY" ] || die "inventory not found: $INVENTORY (run 'inventory' first)"; cmd_compare ;;
export) [ -f "$INVENTORY" ] || die "inventory not found: $INVENTORY (run 'inventory' first)"; IDS=("${ARGS[@]}"); cmd_export ;;
*) usage 1 ;;
esac
