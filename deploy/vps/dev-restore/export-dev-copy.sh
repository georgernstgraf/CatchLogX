#!/usr/bin/env bash
# CatchLogX dev copy (#235): turn a production backup into a sanitised dump that
# developers restore on their own machine - no SSH to `claw`, no prod secrets.
#
# Run on the dev VPS (`claw`) as the unprivileged user `catchlogx`:
#
#   ~/export-dev-copy.sh [--force] [--release] [<archiv>]
#
#   <archiv>   a *.tar.zst in ~/backups (default: the newest)
#   --force    rebuild the dump even if this archive was exported already
#   --release  also publish it as release `dev-copy-<stamp>` in the private
#              data repo (needs an authenticated `gh`)
#
# The live dev database `clx` and catchlogx.service are never touched: the
# archive is restored into the scratch database `clx_devcopy`, checked against
# its rowcounts.txt, sanitised (no sessions, no reset tokens, every password
# hash set to the documented dev password), dumped, and the scratch DB dropped.

set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077
# Never inherit a caller's cwd (see the prune script).
cd /

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
OUT_DIR="${OUT_DIR:-$HOME/dev-copy}"
STATE_DIR="${STATE_DIR:-$HOME/.local/state/catchlogx-dev-copy}"
DATA_REPO="${DATA_REPO:-georgernstgraf/CatchLogX-Data}"
SCRATCH_DB="clx_devcopy"

# bcrypt (cost 10, as services/adminService.ts) of the dev password
# `catchlogx-dev`. Documented in README.md - it is NOT a secret, it only lets a
# developer log in as any user of the copy. Change both places together.
DEV_PASSWORD_HASH='$2b$10$cPfocZnDatI7y8kUl0LetuhVFwM0/fU7cuvqawWEpgPsmZZNqSI0u'

# Tables that leave the copy empty (structure only). Everything else is
# exported in full and must match rowcounts.txt.
EMPTIED=("Session" "PasswordResets")

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "FEHLER: $*"; exit 1; }

force=0
release=0
want=""
for arg in "$@"; do
  case "$arg" in
    --force|-f)   force=1 ;;
    --release|-r) release=1 ;;
    --help|-h)    sed -n '2,18p' "$0"; exit 0 ;;
    -*)           die "unbekannte Option: $arg" ;;
    *)            want="$arg" ;;
  esac
done

tmp=""
scratch_created=0

pg() {
  # $1 = database, rest = psql arguments. On claw the OS user `catchlogx`
  # maps to the DB role `catchlogx` via peer auth (see README.md); PGHOST /
  # PGUSER from the environment are honoured for a local rehearsal.
  local db="$1"; shift
  psql -X -q -v ON_ERROR_STOP=1 -w -d "$db" "$@"
}

cleanup() {
  local rc=$?
  if [ "$scratch_created" -eq 1 ]; then
    pg postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE)" || true
  fi
  [ -n "$tmp" ] && rm -rf -- "$tmp"
  exit "$rc"
}
trap cleanup EXIT

# ---- preflight ---------------------------------------------------------------
pg postgres -tAc 'select 1' >/dev/null 2>&1 \
  || die "keine Datenbankverbindung als $(id -un) - Rolle/peer-Regel in pg_hba.conf prüfen"
[ "$(pg postgres -tAc "select rolsuper or rolcreatedb from pg_roles where rolname = current_user")" = "t" ] \
  || die "die DB-Rolle darf keine Datenbanken anlegen - $SCRATCH_DB ist nicht möglich"
for bin in zstd pg_restore pg_dump sha256sum tar flock; do
  command -v "$bin" >/dev/null || die "$bin fehlt"
done
if [ "$release" -eq 1 ]; then
  command -v gh >/dev/null || die "--release braucht gh (oder ohne --release laufen lassen und von einem Rechner mit gh hochladen)"
  gh auth status >/dev/null 2>&1 || die "gh ist nicht angemeldet (gh auth login)"
fi

# ---- pick the archive -------------------------------------------------------
[ -d "$BACKUP_DIR" ] || die "$BACKUP_DIR fehlt"
archive="$want"
if [ -z "$archive" ]; then
  archive=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.tar.zst' -printf '%T@ %f\n' \
    | sort -rn | head -n1 | cut -d' ' -f2-)
fi
[ -n "$archive" ] || die "kein Klartext-Archiv in $BACKUP_DIR"
[ -f "$BACKUP_DIR/$archive" ] || die "Archiv nicht gefunden: $BACKUP_DIR/$archive"

stamp="${archive%.tar.zst}"
name="dev-copy-$stamp"
asset="$OUT_DIR/$name.dump.zst"

mkdir -p "$STATE_DIR" "$OUT_DIR"
exec 9>"$STATE_DIR/lock"
flock -n 9 || die "ein Export läuft bereits"

# ---- build (skipped when this archive was exported and still verifies) ------
if [ "$force" -eq 0 ] && [ -s "$asset" ] && [ -s "$asset.sha256" ] \
   && ( cd "$OUT_DIR" && sha256sum -c --quiet "$name.dump.zst.sha256" ) 2>/dev/null; then
  log "skip: $name existiert bereits und die Prüfsumme stimmt (--force baut neu)"
else
  log "Start: $archive -> $name"

  log "prüfe Prüfsumme des Archivs"
  ( cd "$BACKUP_DIR" && sha256sum -c --quiet "$archive.sha256" ) \
    || die "Prüfsumme von $archive stimmt nicht"

  tmp=$(mktemp -d /var/tmp/catchlogx-dev-copy.XXXXXX)
  zstd -dc "$BACKUP_DIR/$archive" | tar -C "$tmp" -xf - || die "Archiv lässt sich nicht auspacken"
  setdir=$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n1)
  [ -n "$setdir" ] || die "Archiv enthält kein Satzverzeichnis"
  [ -s "$setdir/db.dump" ] || die "kein db.dump im Archiv"
  [ -s "$setdir/rowcounts.txt" ] || die "kein rowcounts.txt im Archiv"

  log "lege Scratch-DB $SCRATCH_DB an (clx bleibt unberührt)"
  pg postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE)"
  pg postgres -c "CREATE DATABASE \"$SCRATCH_DB\" TEMPLATE template0 ENCODING 'UTF8'"
  scratch_created=1

  log "spiele db.dump ein"
  pg_restore -w --exit-on-error --no-owner --no-privileges -d "$SCRATCH_DB" < "$setdir/db.dump" \
    || die "pg_restore fehlgeschlagen"

  count_of() {
    if [ "$1" = "FileBlob.bytes" ]; then
      pg "$SCRATCH_DB" -tAc 'select coalesce(sum(length(data)),0) from "FileBlob"'
    else
      pg "$SCRATCH_DB" -tAc "select count(*) from \"$1\""
    fi
  }

  log "prüfe Zählwerte gegen rowcounts.txt"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    key="${line%%=*}"; expected="${line#*=}"
    actual=$(count_of "$key")
    [ "$actual" = "$expected" ] \
      || die "Zählwert $key weicht ab: erwartet $expected, eingespielt $actual"
  done < "$setdir/rowcounts.txt"

  # ---- sanitise -------------------------------------------------------------
  # psql variables are only expanded in script input, hence the heredoc.
  # pg_stat_statements is production monitoring: on a developer's Postgres
  # without shared_preload_libraries it is useless, and its install script
  # grants SELECT to PUBLIC (#187) - it does not belong in the copy.
  log "sanitisiere: ${EMPTIED[*]} leeren, Passwort-Hashes ersetzen"
  {
    printf 'BEGIN;\n'
    for t in "${EMPTIED[@]}"; do printf 'DELETE FROM "%s";\n' "$t"; done
    printf 'UPDATE "User" SET "hashedPassword" = :%s;\n' "'hash'"
    printf 'DROP EXTENSION IF EXISTS pg_stat_statements;\n'
    printf 'COMMIT;\n'
  } | pg "$SCRATCH_DB" -v hash="$DEV_PASSWORD_HASH"

  for t in "${EMPTIED[@]}"; do
    [ "$(count_of "$t")" = "0" ] || die "$t ist nach der Sanitisierung nicht leer"
  done
  others=$(printf 'select count(*) from "User" where "hashedPassword" <> :%s;\n' "'hash'" \
    | pg "$SCRATCH_DB" -tA -v hash="$DEV_PASSWORD_HASH")
  [ "$others" = "0" ] || die "$others User-Zeilen tragen noch einen fremden Hash"

  # Row counts of the copy: the archive's, with the emptied tables at 0. Shipped
  # next to the dump so a restore can be checked the same way.
  counts="$tmp/$name.rowcounts.txt"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    key="${line%%=*}"
    printf '%s=%s\n' "$key" "$(count_of "$key")"
  done < "$setdir/rowcounts.txt" > "$counts"

  # ---- dump, compress, checksum --------------------------------------------
  # -Z 0: the custom format would gzip each table; zstd over the whole file
  # compresses better and is what the README tells people to undo.
  log "erzeuge Dump"
  pg_dump -w -Fc -Z 0 --no-owner --no-privileges -d "$SCRATCH_DB" > "$tmp/$name.dump" \
    || die "pg_dump fehlgeschlagen"
  pg_restore --list "$tmp/$name.dump" >/dev/null || die "neuer Dump ist nicht lesbar"
  zstd -q -19 -T0 "$tmp/$name.dump" -o "$tmp/$name.dump.zst" || die "zstd fehlgeschlagen"

  # Publish atomically: either all three files are the new ones or none is.
  umask 022
  for f in "$name.dump.zst" "$name.rowcounts.txt"; do
    install -m 644 "$tmp/$f" "$OUT_DIR/.$f.new"
  done
  mv -f "$OUT_DIR/.$name.dump.zst.new" "$asset"
  mv -f "$OUT_DIR/.$name.rowcounts.txt.new" "$OUT_DIR/$name.rowcounts.txt"
  ( cd "$OUT_DIR" && sha256sum "$name.dump.zst" "$name.rowcounts.txt" > "$name.dump.zst.sha256" )
  umask 077

  pg postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE)"
  scratch_created=0
  log "fertig: $asset ($(du -h "$asset" | cut -f1)), $(grep -c . "$OUT_DIR/$name.rowcounts.txt") Zählwerte"
fi

# ---- release ------------------------------------------------------------------
files=("$asset" "$asset.sha256" "$OUT_DIR/$name.rowcounts.txt")
if [ "$release" -eq 0 ]; then
  log "kein Upload (--release fehlt). Von einem Rechner mit gh:"
  log "  gh release create $name ${files[*]##*/} -R $DATA_REPO --title '$name' --notes-file <README-Abschnitt>"
  exit 0
fi

if gh release view "$name" -R "$DATA_REPO" >/dev/null 2>&1; then
  log "skip: Release $name existiert bereits in $DATA_REPO"
  exit 0
fi

notes=$(cat <<EOF
Sanitised copy of the production database, backup \`$stamp\` (#235).

- \`Session\` and \`PasswordResets\` are empty; every user's password is the dev password \`catchlogx-dev\`.
- No secrets inside - set your own \`DATABASE_URL\`, \`NEXTAUTH_SECRET\` (and \`READONLY_DB_PASSWORD\`, \`NODEMAILER_*\` if needed).

\`\`\`sh
gh release download $name -R $DATA_REPO
sha256sum -c $name.dump.zst.sha256 && zstd -d $name.dump.zst
createdb clx && pg_restore -d clx --no-owner --no-privileges $name.dump
\`\`\`

Full instructions: \`deploy/vps/dev-restore/README.md\` in the app repo.
EOF
)
log "lege Release $name in $DATA_REPO an"
gh release create "$name" "${files[@]}" -R "$DATA_REPO" --title "$name" --notes "$notes" \
  || die "gh release create fehlgeschlagen"
log "Release $name veröffentlicht"
