#!/usr/bin/env bash
# Off-site rotation + integrity check for the BOKU production backups (#86).
#
# Runs on the VPS (catchlogx.graf.priv.at) where the encrypted sets land through
# the nginx PUT endpoint `/backup/` (see the site config). Two jobs:
#   1. re-hash the newest upload against its .sha256 - catches storage damage
#      and truncated transfers, not just a wrong Content-Length at upload time
#   2. rotate: keep the newest KEEP_DAILY sets plus the 1st-of-month sets
#      (up to KEEP_MONTHLY); the `.sha256` file always goes with its archive
#
# Everything here is encrypted garbage without the age identity, so this runs
# on a machine that also serves a student copy of the app.

set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

DIR="${OFFSITE_DIR:-/srv/backups/catchlogx}"
KEEP_DAILY="${OFFSITE_KEEP_DAILY:-7}"
KEEP_MONTHLY="${OFFSITE_KEEP_MONTHLY:-3}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

[ -d "$DIR" ] || { log "FEHLER: $DIR fehlt"; exit 1; }

# ---- 1. integrity of the newest archive -------------------------------------
newest=$(find "$DIR" -maxdepth 1 -type f -name '*.tar.zst.age' -printf '%T@ %f\n' \
  | sort -rn | head -n1 | cut -d' ' -f2-)
if [ -z "$newest" ]; then
  log "WARNUNG: keine Off-site-Archive vorhanden"
else
  if [ -f "$DIR/$newest.sha256" ]; then
    if ( cd "$DIR" && sha256sum -c --quiet "$newest.sha256" ); then
      log "integritaet: $newest ok ($(stat -c%s "$DIR/$newest") Bytes)"
    else
      log "FEHLER: Prüfsumme von $newest stimmt nicht - Transfer oder Platte prüfen"
      exit 1
    fi
  else
    log "FEHLER: $newest hat keine .sha256 - Upload unvollständig"
    exit 1
  fi
fi

# ---- 2. rotation ------------------------------------------------------------
d=0; m=0; removed=0
for f in $(find "$DIR" -maxdepth 1 -type f -name '*.tar.zst.age' -printf '%T@ %f\n' \
             | sort -rn | cut -d' ' -f2-); do
  stamp="${f%%.*}"
  # `YYYYMMDDTHHMMSSZ` -> keep the 1st of a month as the monthly generation
  if [ "$d" -lt "$KEEP_DAILY" ]; then
    d=$((d + 1)); continue
  fi
  if [ "${stamp:6:2}" = "01" ] && [ "$m" -lt "$KEEP_MONTHLY" ]; then
    m=$((m + 1)); continue
  fi
  rm -f -- "$DIR/$f" "$DIR/$f.sha256" && removed=$((removed + 1))
done

log "rotation: $removed entfernt, $d täglich + $m monatlich behalten, $(du -sh "$DIR" | cut -f1) belegt"
