#!/usr/bin/env bash
#
# Uploads the cutover deliveries through the real import path
# (`POST /api/upload/new`, one request per file) and checks every row count
# against the expected value. No script, no bypass: the cutover is the first
# real user of the upload/import pipeline (see README.md, "Phase 2").
#
# Usage:
#   CUTOVER_USER=... CUTOVER_PASS=... ./import-deliveries.sh <base-url> <dir> A B G ...
#   CUTOVER_USER=... CUTOVER_PASS=... ./import-deliveries.sh --probe <base-url> <dir> D E_F I S
#
#   <base-url>   e.g. http://127.0.0.1:3001 (the app itself, not nginx)
#   <dir>        the delivery directory, normally
#                CatchLogX-Data/should_work
#   A B G ...    the short names below (file names are `<short>_valid_final.xlsx`,
#                except D: `2026_D_valid_final_DaniohnePIT.xlsx`)
#
# Without `--probe` a non-2xx answer, an `errors` report or a row count that
# differs from the table below aborts with exit 1. With `--probe` the opposite
# is asserted: the file must be rejected (400) and must not write anything.
#
# Credentials: the import needs a SUPER_ADMIN session. The cutover creates a
# temporary account for it and deletes it again afterwards (README, Phase 2).
set -u

BASE=""
DIR=""
PROBE=0
if [ "${1:-}" = "--probe" ]; then PROBE=1; shift; fi
BASE="${1:-}"; DIR="${2:-}"; shift 2 || true
FILES=("$@")

if [ -z "$BASE" ] || [ -z "$DIR" ] || [ ${#FILES[@]} -eq 0 ]; then
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
if [ -z "${CUTOVER_USER:-}" ] || [ -z "${CUTOVER_PASS:-}" ]; then
  echo "CUTOVER_USER and CUTOVER_PASS must be set" >&2
  exit 2
fi

# Expected row counts, measured from the delivered workbooks (README, "Scope").
declare -A EXPECT=(
  [A]=1939 [B]=13454 [D]=9655 [E_F]=11593 [G]=7304 [I]=5243 [K]=15492
  [L]=3162 [N_O_P]=26980 [R]=1914 [S]=28770 [T]=35413 [W_Y_Z]=22936
)
declare -A BLOCKED=([D]=1 [E_F]=1 [I]=1 [S]=1)

file_for() {
  case "$1" in
    D) echo "2026_D_valid_final_DaniohnePIT.xlsx" ;;
    *)  echo "2026_$1_valid_final.xlsx" ;;
  esac
}

JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
JSON=$(mktemp); trap 'rm -f "$JAR" "$JSON"' EXIT

code=$(curl -sS -o "$JSON" -w '%{http_code}' \
  -c "$JAR" -X POST "$BASE/api/auth/sign-in" \
  -H 'content-type: application/json' \
  --data-binary "{\"username\":\"$CUTOVER_USER\",\"password\":\"$CUTOVER_PASS\"}")
if [ "$code" != "200" ]; then
  echo "sign-in failed: HTTP $code $(head -c 200 "$JSON")" >&2
  exit 1
fi

printf '%-8s %-11s %8s %8s %9s  %s\n' file expected rows http status
total=0
for key in "${FILES[@]}"; do
  name=$(file_for "$key")
  path="$DIR/$name"
  expected=${EXPECT[$key]:-}
  if [ -z "$expected" ]; then echo "unknown key: $key" >&2; exit 2; fi
  if [ ! -f "$path" ]; then echo "missing file: $path" >&2; exit 2; fi

  started=$(date +%s)
  code=$(curl -sS -o "$JSON" -w '%{http_code}' \
    -b "$JAR" -X POST "$BASE/api/upload/new" \
    -H "content-type: application/octet-stream" \
    -H "x-file-name: $name" \
    --data-binary "@$path")
  took=$(( $(date +%s) - started ))

  rows=$(python3 - "$JSON" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print(-1); raise SystemExit
# 200: `catches` is what the import actually wrote; 400: nothing was written.
print(d.get("catches", 0))
PY
)
  printf '%-8s %-11s %8s %8s %8ss  HTTP %s\n' "$key" "$expected" "$rows" "-" "$took" "$code"

  if [ "$PROBE" = "1" ]; then
    if [ "$code" != "400" ] || [ "$rows" != "0" ]; then
      echo "FAIL: $key must be rejected without writing rows (HTTP $code, rows $rows)" >&2
      head -c 600 "$JSON" >&2; echo >&2
      exit 1
    fi
    continue
  fi

  if [ "$code" != "200" ]; then
    echo "FAIL: $key answered HTTP $code" >&2; head -c 800 "$JSON" >&2; echo >&2
    exit 1
  fi
  if [ "$rows" != "$expected" ]; then
    echo "FAIL: $key wrote $rows rows, expected $expected" >&2
    exit 1
  fi
  total=$(( total + rows ))
done

if [ "$PROBE" = "1" ]; then
  echo "OK: ${#FILES[@]} file(s) rejected as expected, nothing written"
else
  echo "OK: ${#FILES[@]} file(s), $total rows"
fi
