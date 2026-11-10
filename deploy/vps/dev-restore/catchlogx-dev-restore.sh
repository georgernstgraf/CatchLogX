#!/usr/bin/env bash
# CatchLogX dev re-seed (#188): wipe the dev database `clx` and restore the
# newest production backup into it.
#
# Run on the dev VPS (`claw`) as the unprivileged user `catchlogx`:
#
#   ~/catchlogx-dev-restore.sh [--force] [<archiv>]
#
# No timer on purpose: this is a manual tool. It renames the live database to
# `clx_prev` first and drops it only after the app answers 200 again, so a
# failed run never leaves the dev instance without a database.
#
# The archives come from the production host over SSH (#192) and are plain
# tar.zst sets: db.dump, db.dump.list, rowcounts.txt, SHA256SUMS, env.age.
# `env.age` is ignored here - the dev instance keeps its own `.env`.

set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077
# Never inherit a caller's cwd (see the prune script).
cd /

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
STATE_DIR="${STATE_DIR:-$HOME/.local/state/catchlogx-dev-restore}"
STATE_FILE="$STATE_DIR/last-restored"
ENV_FILE="${ENV_FILE:-$HOME/repos/georgernstgraf/CatchLogX/.env}"
RELEASE_DIR="${RELEASE_DIR:-$HOME/current}"
PRISMA="${PRISMA:-$HOME/tools/prisma-cli/node_modules/.bin/prisma}"
DB="clx"
DB_PREV="clx_prev"
APP_URL="http://127.0.0.1:40873/"
PG_OWNER="clxadmin"

# systemctl --user needs the runtime dir when this runs from a plain
# `ssh claw '...'` (non-login shell).
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "FEHLER: $*"; exit 1; }

force=0
want=""
for arg in "$@"; do
  case "$arg" in
    --force|-f) force=1 ;;
    --help|-h)  sed -n '2,15p' "$0"; exit 0 ;;
    -*)         die "unbekannte Option: $arg" ;;
    *)          want="$arg" ;;
  esac
done

tmp=""
app_stopped=0
app_healthy=0

cleanup() {
  local rc=$?
  if [ "$app_stopped" -eq 1 ] && [ "$app_healthy" -eq 0 ]; then
    log "App war gestoppt - starte sie wieder"
    systemctl --user start catchlogx.service || true
  fi
  [ -n "$tmp" ] && rm -rf -- "$tmp"
  exit "$rc"
}
trap cleanup EXIT

pg() {
  # $1 = database, rest = psql arguments. Runs as the cluster superuser over the
  # local socket (peer auth); the objects are created as clxadmin below.
  local db="$1"; shift
  sudo -n -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"
}

# ---- pick the archive -------------------------------------------------------
[ -d "$BACKUP_DIR" ] || die "$BACKUP_DIR fehlt"

archive="$want"
if [ -z "$archive" ]; then
  archive=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.tar.zst' -printf '%T@ %f\n' \
    | sort -rn | head -n1 | cut -d' ' -f2-)
fi
[ -n "$archive" ] || die "kein Klartext-Archiv in $BACKUP_DIR (noch keins angekommen?)"
[ -f "$BACKUP_DIR/$archive" ] || die "Archiv nicht gefunden: $BACKUP_DIR/$archive"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/lock"
flock -n 9 || die "ein Restore läuft bereits"

if [ "$force" -eq 0 ] && [ -r "$STATE_FILE" ] && [ "$(cat "$STATE_FILE")" = "$archive" ]; then
  log "skip: $archive wurde bereits eingespielt (--force erzwingt einen Lauf)"
  exit 0
fi

log "Start: $archive"

# ---- verify + unpack --------------------------------------------------------
log "prüfe Prüfsumme"
( cd "$BACKUP_DIR" && sha256sum -c --quiet "$archive.sha256" ) \
  || die "Prüfsumme von $archive stimmt nicht - Transfer oder Platte prüfen"

tmp=$(mktemp -d /var/tmp/catchlogx-dev-restore.XXXXXX)
log "packe aus nach $tmp"
zstd -dc "$BACKUP_DIR/$archive" | tar -C "$tmp" -xf - || die "Archiv lässt sich nicht auspacken"
setdir=$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n1)
[ -n "$setdir" ] || die "Archiv enthält kein Satzverzeichnis"
[ -s "$setdir/db.dump" ] || die "kein db.dump im Archiv"
[ -s "$setdir/rowcounts.txt" ] || die "kein rowcounts.txt im Archiv"

# ---- swap the database ------------------------------------------------------
log "stoppe catchlogx.service"
systemctl --user stop catchlogx.service || die "App ließ sich nicht stoppen"
app_stopped=1

log "ersetze $DB (alt -> $DB_PREV)"
pg postgres -c "DROP DATABASE IF EXISTS \"$DB_PREV\" WITH (FORCE)"
pg postgres -c "ALTER DATABASE \"$DB\" RENAME TO \"$DB_PREV\""
pg postgres -c "CREATE DATABASE \"$DB\" OWNER $PG_OWNER TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'"

log "spiele db.dump ein (Owner $PG_OWNER)"
# Read the dump through stdin: `postgres` cannot enter the 0700 temp directory
# of `catchlogx` (and the dump must not be world-readable in /var/tmp either).
sudo -n -u postgres pg_restore -w --exit-on-error --no-owner --no-privileges \
  --role="$PG_OWNER" -d "$DB" < "$setdir/db.dump" \
  || die "pg_restore fehlgeschlagen - $DB_PREV bleibt erhalten"

log "prüfe Zählwerte gegen rowcounts.txt"
while IFS= read -r line; do
  key="${line%%=*}"; expected="${line#*=}"
  if [ "$key" = "FileBlob.bytes" ]; then
    actual=$(pg "$DB" -tAc 'select coalesce(sum(length(data)),0) from "FileBlob"')
  else
    actual=$(pg "$DB" -tAc "select count(*) from \"$key\"")
  fi
  [ "$actual" = "$expected" ] \
    || die "Zählwert $key weicht ab: erwartet $expected, wiederhergestellt $actual"
done < "$setdir/rowcounts.txt"

# ---- bring the schema to the running release --------------------------------
# dev is usually ahead of production (the dump carries the production schema),
# so the migrations of the deployed release have to be applied - otherwise e.g.
# QueryLog is missing and the SQL page answers 500 (#121).
[ -x "$PRISMA" ] || die "Prisma-CLI fehlt: $PRISMA (npm i --prefix ~/tools/prisma-cli prisma@6.10.1)"
[ -r "$ENV_FILE" ] || die "$ENV_FILE fehlt"
[ -r "$RELEASE_DIR/prisma/schema.prisma" ] || die "$RELEASE_DIR/prisma/schema.prisma fehlt"
db_url=$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | head -n1)
# The env file quotes the value with double quotes; libpq/Prisma want it bare.
db_url="${db_url%$'\r'}"
db_url="${db_url%\"}"; db_url="${db_url#\"}"
db_url="${db_url%\'}"; db_url="${db_url#\'}"
[ -n "$db_url" ] || die "DATABASE_URL nicht in $ENV_FILE"

log "wende Migrationen des Releases $(basename "$(readlink -f "$RELEASE_DIR")") an"
DATABASE_URL="$db_url" "$PRISMA" migrate deploy --schema "$RELEASE_DIR/prisma/schema.prisma" \
  || die "prisma migrate deploy fehlgeschlagen - $DB_PREV bleibt erhalten"

# ---- read-only role back into shape (#121) ----------------------------------
log "setze clx_readonly neu (Whitelist)"
pg "$DB" -c 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM clx_readonly'
pg "$DB" -c 'GRANT USAGE ON SCHEMA public TO clx_readonly'
pg "$DB" -c 'GRANT SELECT ON fish_catches, samplings, river_sites, fish_species TO clx_readonly'

# ---- start, check, drop the old copy ---------------------------------------
log "starte catchlogx.service"
systemctl --user start catchlogx.service
ok=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 5 "$APP_URL"; then ok=1; break; fi
  sleep 1
done
[ "$ok" -eq 1 ] || die "Health-Check auf $APP_URL fehlgeschlagen - $DB_PREV bleibt erhalten"
app_healthy=1

pg postgres -c "DROP DATABASE IF EXISTS \"$DB_PREV\" WITH (FORCE)"
printf '%s\n' "$archive" > "$STATE_FILE"

log "fertig: $archive eingespielt ($(pg "$DB" -tAc 'select count(*) from fish_catches') Fänge, $(pg "$DB" -tAc 'select count(*) from "FileBlob"') Blobs, $(pg "$DB" -tAc 'select count(*) from _prisma_migrations') Migrationen)"
