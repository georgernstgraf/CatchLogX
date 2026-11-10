#!/usr/bin/env bash
# Off-site rotation + integrity check for the BOKU production backups (#86, #192).
#
# Runs on the VPS (catchlogx.graf.priv.at) as the user `catchlogx`, into whose
# home the archives are written (SSH + rsync with a forced `rrsync -wo`, see
# README.md). Two jobs:
#   1. re-hash the newest upload against its .sha256 - catches storage damage
#      and truncated transfers, not just a wrong size at upload time
#   2. rotate: keep the newest KEEP_DAILY sets plus the 1st-of-month sets
#      (up to KEEP_MONTHLY); the `.sha256` file always goes with its archive
#
# Since #192 the archives are plain tar.zst - the dump is readable on this
# machine. That is deliberate: the dev instance restores it and then holds the
# same data in its own database. They are mode 0600 in a 0700 directory, and
# only the database dump travels; the production secrets stay in an encrypted
# env.age inside the archive.
#
# The old age-encrypted `*.tar.zst.age` files are still rotated: they age out
# on their own once KEEP_DAILY plaintext sets exist. Do not delete them by hand
# before that - they are the only off-site copies of the days before #192.

set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

DIR="${OFFSITE_DIR:-/home/catchlogx/backups}"
KEEP_DAILY="${OFFSITE_KEEP_DAILY:-7}"
KEEP_MONTHLY="${OFFSITE_KEEP_MONTHLY:-3}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

[ -d "$DIR" ] || { log "FEHLER: $DIR fehlt"; exit 1; }

# Both generations: plain (since #192) and age-encrypted (legacy, #86).
archives() {
  find "$DIR" -maxdepth 1 -type f \( -name '*.tar.zst' -o -name '*.tar.zst.age' \) \
    -printf '%T@ %f\n' | sort -rn | cut -d' ' -f2-
}

# ---- 1. integrity of the newest archive -------------------------------------
newest=$(archives | head -n1)
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
for f in $(archives); do
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
