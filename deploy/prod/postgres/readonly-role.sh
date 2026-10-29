#!/usr/bin/env bash
# Rotate (or just verify) the read-only statistics role on the production
# cluster (#152, #170).
#
# This replaces the `readonly-role` dispatch job of the retired
# production-maintenance.yml: since 2026-10-30 maintenance happens over the
# BOKU VPN, so the procedure lives here as a versioned script that is pulled
# with the root-owned runbook checkout (/root/CatchLogX since #122 - the old
# /opt/CatchLogX checkout is gone; clxadmin's runtime env lives in its home).
#
# Modes:
#   ./readonly-role.sh                  rotate: new password, write it to .env
#   KEEP_PASSWORD=1 ./readonly-role.sh  verify/repair only: keep the password
#                                       that is already in .env (used by the
#                                       migration window - no coordination with
#                                       the research group needed)
#
# What it does:
#   1. upserts the role (NOSUPERUSER/NOCREATEDB/NOCREATEROLE, CONNECTION LIMIT 40);
#   2. grants SELECT on every `public` table EXCEPT the auth tables, positively,
#      and sets default privileges for future tables;
#   3. rotates the password ON THE MACHINE (never printed, never a repository
#      secret) and writes it into the runtime env file as READONLY_DB_PASSWORD
#      (0600, atomically) - that file is the only copy the app reads (#153);
#   4. verifies on the REAL path: TCP against the host address, TLS required,
#      wrong password rejected, reads allowed, writes and auth tables denied.
#
# Re-running a rotating run is the rotation. The app does not read the value
# until #153 ships, so no restart is needed.

set -euo pipefail

ROLE="${ROLE:-clx_readonly}"
DB="${DB:-clx}"
PG_USER="${PG_USER:-clxadmin}"           # owner of the tables / default privileges
ENV_FILE="${ENV_FILE:-/home/clxadmin/.config/catchlogx/.env}"
ENV_OWNER="${ENV_OWNER:-clxadmin:clxadmin}"
PG_EXT_HOST="${PG_EXT_HOST:-141.244.222.191}"
PG_EXT_PORT="${PG_EXT_PORT:-5432}"
CONN_LIMIT="${CONN_LIMIT:-40}"
KEEP_PASSWORD="${KEEP_PASSWORD:-0}"
AUTH_TABLES=(User Session PasswordResets)

[ "$(id -u)" -eq 0 ] || { echo "FEHLER: als root ausführen" >&2; exit 1; }
command -v runuser >/dev/null || { echo "FEHLER: runuser fehlt" >&2; exit 1; }

# Server-side work runs as clxadmin over the local socket (peer auth). Running
# the grants as clxadmin matters: ALTER DEFAULT PRIVILEGES applies to the
# objects that ROLE creates later.
pg() { runuser -u "$PG_USER" -- psql -X -q -w -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

env_get() {
  [ -r "$ENV_FILE" ] || return 1
  sed -n "s/^$1=//p" "$ENV_FILE" | head -n1
}

echo "== 1/5 Voraussetzungen"
pg -tAc 'select 1' >/dev/null || { echo "FEHLER: Datenbank nicht erreichbar" >&2; exit 1; }

# Refuse to grant anything if the schema is not what we think it is: every auth
# table must exist, otherwise the "everything except these" grant would silently
# become "everything".
AUTH_LIST=""
for t in "${AUTH_TABLES[@]}"; do
  if [ "$(pg -tAc "SELECT to_regclass('public.\"$t\"') IS NOT NULL")" != "t" ]; then
    echo "FEHLER: erwartete Auth-Tabelle '$t' fehlt - Skript prüfen, bevor Rechte vergeben werden" >&2
    exit 1
  fi
  [ -n "$AUTH_LIST" ] && AUTH_LIST="$AUTH_LIST, "
  AUTH_LIST="$AUTH_LIST\"$t\""
done

TABLES="$(pg -tAc "SELECT string_agg(format('%I', tablename), ', ') FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('${AUTH_TABLES[0]}','${AUTH_TABLES[1]}','${AUTH_TABLES[2]}')")"
[ -n "$TABLES" ] || { echo "FEHLER: keine lesbaren Tabellen in schema public" >&2; exit 1; }

echo "== 2/5 Passwort"
if [ "$KEEP_PASSWORD" = "1" ]; then
  PW="$(env_get READONLY_DB_PASSWORD)" || true
  [ -n "$PW" ] || { echo "FEHLER: KEEP_PASSWORD=1, aber READONLY_DB_PASSWORD fehlt in $ENV_FILE" >&2; exit 1; }
  echo "   KEEP_PASSWORD=1: bestehendes Passwort aus $ENV_FILE wird beibehalten (keine Rotation)."
else
  PW="$(openssl rand -base64 9)"
  [ ${#PW} -ge 12 ] || { echo "FEHLER: erzeugtes Passwort zu kurz" >&2; exit 1; }
  echo "   neues Passwort erzeugt (wird nicht angezeigt)."
fi

echo "== 3/5 Rolle und Rechte setzen"
EXISTS="$(pg -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$ROLE'")"
if [ -z "$EXISTS" ]; then
  printf '%s\n' '\getenv pw PG_NEW_PW' \
    "CREATE ROLE \"$ROLE\" LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT $CONN_LIMIT;" \
    | PG_NEW_PW="$PW" pg -f -
  echo "   Rolle $ROLE angelegt."
elif [ "$KEEP_PASSWORD" = "1" ]; then
  pg -c "ALTER ROLE \"$ROLE\" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT $CONN_LIMIT;"
  echo "   Rolle $ROLE bestätigt (Attribute gesetzt, Passwort unverändert)."
else
  printf '%s\n' '\getenv pw PG_NEW_PW' \
    "ALTER ROLE \"$ROLE\" WITH LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT $CONN_LIMIT;" \
    | PG_NEW_PW="$PW" pg -f -
  echo "   Rolle $ROLE aktualisiert (Passwort rotiert)."
fi

pg -f - <<SQL
GRANT CONNECT ON DATABASE "$DB" TO "$ROLE";
GRANT USAGE ON SCHEMA public TO "$ROLE";
GRANT SELECT ON TABLE $TABLES TO "$ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "$ROLE";
REVOKE SELECT ON TABLE $AUTH_LIST FROM "$ROLE";
SQL
echo "   SELECT auf: $TABLES"
echo "   gesperrt:   $AUTH_LIST"

echo "== 4/5 Passwort in $ENV_FILE"
if [ "$KEEP_PASSWORD" = "1" ]; then
  echo "   unverändert (KEEP_PASSWORD=1)."
else
  TMP="$(mktemp)"
  trap 'rm -f "$TMP"' EXIT
  if [ -f "$ENV_FILE" ]; then
    grep -v '^READONLY_DB_PASSWORD=' "$ENV_FILE" > "$TMP" || true
  fi
  printf 'READONLY_DB_PASSWORD=%s\n' "$PW" >> "$TMP"
  chmod 600 "$TMP"
  chown "$ENV_OWNER" "$TMP"
  mv "$TMP" "$ENV_FILE"
  trap - EXIT
  chmod 600 "$ENV_FILE"
  chown "$ENV_OWNER" "$ENV_FILE"
  echo "   geschrieben (Wert nicht angezeigt). Vorhandene Schlüssel:"
  sed -E 's/=.*/=<set>/' "$ENV_FILE" | sed 's/^/     /' | sort
fi

echo "== 5/5 Verifikation über die echte Strecke ($PG_EXT_HOST:$PG_EXT_PORT, sslmode=require)"
fail=0
ext() {
  local pw="$1"; shift
  PGPASSWORD="$pw" PGCONNECT_TIMEOUT=10 psql -X -q -w -v ON_ERROR_STOP=1 \
    "host=$PG_EXT_HOST port=$PG_EXT_PORT dbname=$DB user=$ROLE sslmode=require" "$@"
}

if ext "definitely-wrong" -tAc 'SELECT 1' >/dev/null 2>&1; then
  echo "   FEHLER: falsches Passwort wurde akzeptiert - Passwort-Auth greift nicht" >&2
  fail=1
else
  echo "   falsches Passwort: abgewiesen"
fi

READ_TABLE="$(pg -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('${AUTH_TABLES[0]}','${AUTH_TABLES[1]}','${AUTH_TABLES[2]}') ORDER BY tablename LIMIT 1")"
if ext "$PW" -tAc "SELECT count(*) FROM \"$READ_TABLE\"" >/dev/null 2>&1; then
  echo "   richtiges Passwort: akzeptiert, Lesen erlaubt ($READ_TABLE)"
else
  echo "   FEHLER: Lesen als $ROLE fehlgeschlagen" >&2
  fail=1
fi

if ext "$PW" -tAc 'SELECT 1 FROM "Session" LIMIT 1' >/dev/null 2>&1; then
  echo "   FEHLER: $ROLE kann Session lesen - REVOKE hat nicht gegriffen" >&2
  fail=1
else
  echo "   Auth-Tabellen: gesperrt (Session)"
fi

if ext "$PW" -c 'CREATE TABLE public._readonly_probe(i int)' >/dev/null 2>&1; then
  ext "$PW" -c 'DROP TABLE public._readonly_probe' >/dev/null 2>&1 || true
  echo "   FEHLER: $ROLE kann schreiben" >&2
  fail=1
else
  echo "   Schreiben: verweigert (CREATE TABLE)"
fi

ATTRS="$(pg -tAc "SELECT rolsuper||'|'||rolcreatedb||'|'||rolcreaterole||'|'||rolcanlogin||'|'||rolconnlimit FROM pg_roles WHERE rolname='$ROLE'")"
echo "   pg_roles (super|createdb|createrole|canlogin|connlimit): $ATTRS"

echo
if [ "$fail" -eq 0 ]; then
  echo "OK: $ROLE ist bereit. Passwort für die Forschungsgruppe: $ENV_FILE (READONLY_DB_PASSWORD)."
  echo "    Verbindungsdaten: host=$PG_EXT_HOST port=$PG_EXT_PORT dbname=$DB user=$ROLE sslmode=prefer"
else
  echo "FEHLGESCHLAGEN: siehe Meldungen oben." >&2
  exit 1
fi
