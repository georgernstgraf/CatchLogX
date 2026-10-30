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
#   1. upserts the role (NOSUPERUSER/NOCREATEDB/NOCREATEROLE, CONNECTION LIMIT 108);
#   2. clears every table privilege of the role and grants SELECT on the
#      WHITELIST of research tables only (READ_TABLES) - one read-only account
#      for both consumers (#121): the research group in psql/R and the app's
#      SQL page, which reads the same role through QUERY_DATABASE_URL. Anything
#      granted here is reachable from the web UI by every signed-in user, so
#      Uploads/FileBlob/UserQueries and the auth tables stay closed;
#   3. revokes the "SELECT on all future tables" default privilege, so a later
#      migration cannot widen the role by accident (QueryLog, ...);
#   4. rotates the password ON THE MACHINE (never printed, never a repository
#      secret) and writes it into the runtime env file as READONLY_DB_PASSWORD
#      (0600, atomically) - that file is the only copy the app reads (#153);
#   5. verifies on the REAL path: TCP against the host address, TLS required,
#      wrong password rejected, whitelist readable, everything else and writes
#      denied.
#
# Re-running a rotating run is the rotation. The app does not read the value
# until #121/#153 ship, so no restart is needed.

set -euo pipefail

ROLE="${ROLE:-clx_readonly}"
DB="${DB:-clx}"
PG_USER="${PG_USER:-clxadmin}"           # role used for the server-side work (peer/socket)
ENV_FILE="${ENV_FILE:-/home/clxadmin/.config/catchlogx/.env}"
ENV_OWNER="${ENV_OWNER:-clxadmin:clxadmin}"
PG_EXT_HOST="${PG_EXT_HOST:-141.244.222.191}"
PG_EXT_PORT="${PG_EXT_PORT:-5432}"
# 108 = the generous ceiling for ~50 research-group users (#171). It is a
# ROLE-WIDE limit, not per client address: PostgreSQL has no per-IP limit, and
# max_connections (200 in 99-catchlogx.conf) is what makes 108 reachable at all.
CONN_LIMIT="${CONN_LIMIT:-108}"
KEEP_PASSWORD="${KEEP_PASSWORD:-0}"
# Table owner: the app role that creates the tables, whose DEFAULT PRIVILEGES
# must not hand the read-only role every future table. Kept separate from
# PG_USER so the script also runs on the dev cluster, where the local socket is
# peer-only for `postgres` (PG_USER=postgres) while the tables belong to
# `clxadmin`.
TBL_OWNER="${TBL_OWNER:-clxadmin}"
# ONE read-only account serves both consumers (#121): the research group in
# psql/R and the app's SQL page. Whatever is listed here is readable from the
# web UI by every signed-in user, so this is a whitelist, not "everything minus
# auth": Uploads/FileBlob/UserQueries and the auth tables stay closed.
READ_TABLES=(fish_catches samplings river_sites fish_species)

[ "$(id -u)" -eq 0 ] || { echo "FEHLER: als root ausführen" >&2; exit 1; }
command -v runuser >/dev/null || { echo "FEHLER: runuser fehlt" >&2; exit 1; }

# Server-side work runs as clxadmin over the local socket (peer auth). The
# default-privilege step names the table owner explicitly (TBL_OWNER), because
# it must revoke what the owner's earlier runs granted - on the dev cluster the
# server-side commands run as `postgres` instead.
pg() { runuser -u "$PG_USER" -- psql -X -q -w -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

env_get() {
  [ -r "$ENV_FILE" ] || return 1
  sed -n "s/^$1=//p" "$ENV_FILE" | head -n1
}

echo "== 1/5 Voraussetzungen"
pg -tAc 'select 1' >/dev/null || { echo "FEHLER: Datenbank nicht erreichbar" >&2; exit 1; }

# Refuse to work if the schema is not what we think it is: every whitelist
# table must exist, otherwise a typo would silently shrink the grant to nothing
# while the verification below still "passes" on whatever is left.
READ_LIST=""
READ_SQL_LIST=""
for t in "${READ_TABLES[@]}"; do
  if [ "$(pg -tAc "SELECT to_regclass('public.\"$t\"') IS NOT NULL")" != "t" ]; then
    echo "FEHLER: erwartete Tabelle '$t' fehlt - Skript prüfen, bevor Rechte vergeben werden" >&2
    exit 1
  fi
  [ -n "$READ_LIST" ] && READ_LIST="$READ_LIST, "
  READ_LIST="$READ_LIST\"$t\""
  READ_SQL_LIST="$READ_SQL_LIST,'$t'"
done
READ_SQL_LIST="${READ_SQL_LIST#,}"

# Everything else in schema public is denied. Derived from pg_tables, not
# hardcoded, so a future table (QueryLog, ...) is denied by default and the
# verification below covers it without a code change.
DENY_LIST="$(pg -tAc "SELECT coalesce(string_agg(format('%I', tablename), ', '), '')
  FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ($READ_SQL_LIST)")"
DENY_TABLES="$(pg -tAc "SELECT coalesce(string_agg(tablename, ' '), '')
  FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ($READ_SQL_LIST)")"

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
-- Clear the previous grant set first: a plain GRANT would leave tables
-- readable that the role could read under the older "everything except auth"
-- rule (Uploads, FileBlob, UserQueries, _prisma_migrations).
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "$ROLE";
GRANT SELECT ON TABLE $READ_LIST TO "$ROLE";
-- Older versions granted SELECT on all FUTURE tables. That must stop, or the
-- next migration (QueryLog) becomes readable from the web UI by accident.
ALTER DEFAULT PRIVILEGES FOR ROLE "$TBL_OWNER" IN SCHEMA public
  REVOKE SELECT ON TABLES FROM "$ROLE";
SQL
echo "   SELECT auf: $READ_LIST"
echo "   gesperrt:   ${DENY_LIST:-<keine weiteren Tabellen>}"

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

for t in "${READ_TABLES[@]}"; do
  if ext "$PW" -tAc "SELECT count(*) FROM \"$t\"" >/dev/null 2>&1; then
    echo "   lesbar:   $t"
  else
    echo "   FEHLER: $t ist für $ROLE nicht lesbar" >&2
    fail=1
  fi
done

for t in $DENY_TABLES; do
  if ext "$PW" -tAc "SELECT 1 FROM \"$t\" LIMIT 1" >/dev/null 2>&1; then
    echo "   FEHLER: $ROLE kann $t lesen - die Whitelist greift nicht" >&2
    fail=1
  else
    echo "   gesperrt: $t"
  fi
done

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
  echo "    Dieselbe Rolle bedient die SQL-Seite der App über QUERY_DATABASE_URL (#121)."
else
  echo "FEHLGESCHLAGEN: siehe Meldungen oben." >&2
  exit 1
fi
