#!/usr/bin/env bash
# Create or rotate the role behind the SQL query UI (#121).
#
# The release is a standalone build without scripts/, so `npm run db:query-role`
# is not available on the hosts. This is its runbook counterpart, in the style of
# readonly-role.sh. Run it from the root-owned checkout AFTER the add_query_log
# migration is applied and BEFORE the app needs the role.
#
# Modes:
#   ./query-role.sh                  rotate: new password, write QUERY_DATABASE_URL
#   KEEP_PASSWORD=1 ./query-role.sh  verify/repair only: keep the URL in .env
#
# Everything host-specific can be overridden, e.g. for the dev instance:
#   ENV_FILE=... ENV_OWNER=catchlogx:catchlogx PG_USER=postgres ./query-role.sh
#
# Keep READABLE_TABLES in sync with scripts/create-query-role.ts.

set -euo pipefail

ROLE="${ROLE:-clx_query}"
DB="${DB:-clx}"
PG_USER="${PG_USER:-clxadmin}"
ENV_FILE="${ENV_FILE:-/home/clxadmin/.config/catchlogx/.env}"
ENV_OWNER="${ENV_OWNER:-clxadmin:clxadmin}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
KEEP_PASSWORD="${KEEP_PASSWORD:-0}"
READABLE_TABLES=(fish_catches samplings river_sites fish_species)

[ "$(id -u)" -eq 0 ] || { echo "FEHLER: als root ausführen" >&2; exit 1; }
command -v runuser >/dev/null || { echo "FEHLER: runuser fehlt" >&2; exit 1; }

pg() { runuser -u "$PG_USER" -- psql -X -q -w -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

echo "== 1/4 Voraussetzungen"
for t in "${READABLE_TABLES[@]}" QueryLog; do
  if [ "$(pg -tAc "SELECT to_regclass('public.\"$t\"') IS NOT NULL")" != "t" ]; then
    echo "FEHLER: Tabelle '$t' fehlt - ist die Migration add_query_log eingespielt?" >&2
    exit 1
  fi
done

echo "== 2/4 Passwort"
if [ "$KEEP_PASSWORD" = "1" ]; then
  URL="$(sed -n 's/^QUERY_DATABASE_URL=//p' "$ENV_FILE" | head -n1)"
  [ -n "$URL" ] || { echo "FEHLER: KEEP_PASSWORD=1, aber QUERY_DATABASE_URL fehlt in $ENV_FILE" >&2; exit 1; }
  PW="$(printf '%s' "$URL" | sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\1#')"
  echo "   bestehendes Passwort wird beibehalten."
else
  # Hex only: the value goes into a connection URL unescaped.
  PW="$(openssl rand -hex 24)"
  echo "   neues Passwort erzeugt (wird nicht angezeigt)."
fi

echo "== 3/4 Rolle und Rechte setzen"
printf '%s\n' '\getenv pw PG_NEW_PW' "SELECT format(
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE')
      THEN 'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L'
      ELSE 'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L'
    END, '$ROLE', :'pw') \\gexec" | PG_NEW_PW="$PW" pg -f -

GRANTS=""
for t in "${READABLE_TABLES[@]}"; do
  GRANTS="$GRANTS GRANT SELECT ON TABLE public.\"$t\" TO \"$ROLE\";"
done
pg -f - <<SQL
GRANT CONNECT ON DATABASE "$DB" TO "$ROLE";
GRANT USAGE ON SCHEMA public TO "$ROLE";
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "$ROLE";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "$ROLE";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM "$ROLE";
$GRANTS
ALTER ROLE "$ROLE" SET default_transaction_read_only = on;
ALTER ROLE "$ROLE" SET statement_timeout = '10s';
SQL

if [ "$KEEP_PASSWORD" != "1" ]; then
  TMP="$(mktemp)"
  trap 'rm -f "$TMP"' EXIT
  grep -v '^QUERY_DATABASE_URL=' "$ENV_FILE" > "$TMP" || true
  printf 'QUERY_DATABASE_URL=postgresql://%s:%s@%s:%s/%s?schema=public\n' \
    "$ROLE" "$PW" "$PG_HOST" "$PG_PORT" "$DB" >> "$TMP"
  chmod 600 "$TMP"
  chown "$ENV_OWNER" "$TMP"
  mv "$TMP" "$ENV_FILE"
  trap - EXIT
  echo "   QUERY_DATABASE_URL in $ENV_FILE geschrieben (Wert nicht angezeigt)."
fi

echo "== 4/4 Verifikation als $ROLE über TCP ($PG_HOST:$PG_PORT)"
fail=0
as_role() {
  PGPASSWORD="$PW" PGCONNECT_TIMEOUT=10 psql -X -q -w -v ON_ERROR_STOP=1 \
    "host=$PG_HOST port=$PG_PORT dbname=$DB user=$ROLE" "$@"
}

if as_role -tAc 'SELECT count(*) FROM fish_catches' >/dev/null 2>&1; then
  echo "   Lesen: erlaubt (fish_catches)"
else
  echo "   FEHLER: Lesen als $ROLE fehlgeschlagen" >&2
  fail=1
fi

for t in User Session Uploads FileBlob QueryLog; do
  if as_role -tAc "SELECT 1 FROM \"$t\" LIMIT 1" >/dev/null 2>&1; then
    echo "   FEHLER: $ROLE kann $t lesen" >&2
    fail=1
  else
    echo "   gesperrt: $t"
  fi
done

# Two -c on purpose: in one string the SET would not apply to the statement after it,
# and the probe would only prove the read-only default, not the grants.
if as_role -c 'SET default_transaction_read_only = off' -c 'CREATE TABLE public._query_probe(i int)' >/dev/null 2>&1; then
  pg -c 'DROP TABLE IF EXISTS public._query_probe' >/dev/null 2>&1 || true
  echo "   FEHLER: $ROLE kann schreiben" >&2
  fail=1
else
  echo "   Schreiben: verweigert, auch ohne read-only (Grants greifen allein)"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "OK: $ROLE ist bereit. Die App-Unit neu starten, damit sie die Env liest."
else
  echo "FEHLGESCHLAGEN: siehe Meldungen oben." >&2
  exit 1
fi
