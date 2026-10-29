#!/usr/bin/env bash
# Prepare the native PostgreSQL 16 cluster on the production host (#170).
#
# Idempotent. Does NOT start the cluster and does NOT touch the running
# container: the container still owns port 5432 until the maintenance window.
# Run this days before the window, then apply the config, then wait.
#
#   ./provision-cluster.sh          # packages + cluster + config + TLS cert
#
# What it does:
#   1. adds the PGDG apt repository (Ubuntu 26.04 ships PostgreSQL 18 only);
#   2. stops postgresql-common from auto-creating and auto-starting a cluster
#      during the package install - on this host port 5432 belongs to the
#      container until the window;
#   3. installs postgresql-16 + postgresql-client-16;
#   4. creates cluster 16/main with the SAME locale as the current database
#      (en_US.utf8) and start.conf = manual. Creating it with the host default
#      C.UTF-8 would silently change text sort order for the research group.
#   5. installs conf.d/99-catchlogx.conf, pg_hba.conf and a self-signed TLS
#      certificate.
#
# Nothing here is destructive: an existing cluster or an existing PGDATA is
# never dropped or re-initialised.

set -euo pipefail

VERSION=16
NAME=main
CLUSTER_DIR="/etc/postgresql/$VERSION/$NAME"
DATA_DIR="/var/lib/postgresql/$VERSION/$NAME"
LOCALE="${LOCALE:-en_US.UTF-8}"
ENCODING="${ENCODING:-UTF8}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "FEHLER: als root ausführen" >&2; exit 1; }

echo "== 1/6 PGDG-Repository"
KEYRING=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
if [ ! -s "$KEYRING" ]; then
  install -d -m 755 "$(dirname "$KEYRING")"
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$KEYRING"
  chmod 644 "$KEYRING"
  echo "   Key installiert ($(gpg --show-keys --with-colons "$KEYRING" 2>/dev/null | awk -F: '/^fpr/{print $10; exit}'))"
fi
cat > /etc/apt/sources.list.d/pgdg.list <<EOF
deb [signed-by=$KEYRING] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "${VERSION_CODENAME}-pgdg") main
EOF
echo "   $(cat /etc/apt/sources.list.d/pgdg.list)"

echo "== 2/6 Automatische Cluster-Erzeugung unterbinden"
CC=/etc/postgresql-common/createcluster.conf
install -d -m 755 /etc/postgresql-common
if [ -f "$CC" ] && grep -qE '^[[:space:]]*create_main_cluster' "$CC"; then
  sed -i -E "s/^[[:space:]]*#?[[:space:]]*create_main_cluster.*/create_main_cluster = false/" "$CC"
else
  printf 'create_main_cluster = false\n' >> "$CC"
fi
grep -E '^create_main_cluster' "$CC" | sed 's/^/   /'

echo "== 3/6 Pakete"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# The PGDG postgresql-16 package ships the contrib libraries (pg_stat_statements,
# auto_explain, auth_delay) - no separate contrib package is needed (verified on
# the dev VPS, #168).
apt-get install -y -o Dpkg::Options::=--force-confold postgresql-16 postgresql-client-16
echo "   $(psql --version)"

echo "== 4/6 Cluster $VERSION/$NAME"
if [ -d "$DATA_DIR" ] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
  echo "   PGDATA existiert bereits - unangetastet: $DATA_DIR"
else
  if [ -d "$CLUSTER_DIR" ]; then
    echo "   Konfiguration existiert, PGDATA ist leer - Cluster wird nicht neu angelegt."
  else
    pg_createcluster "$VERSION" "$NAME" --start-conf=manual \
      --locale="$LOCALE" --encoding="$ENCODING"
  fi
fi
pg_lsclusters | sed 's/^/   /'

echo "== 5/6 Konfiguration"
install -d -m 755 "$CLUSTER_DIR/conf.d"
install -m 644 "$SRC_DIR/99-catchlogx.conf" "$CLUSTER_DIR/conf.d/99-catchlogx.conf"
install -m 640 -o postgres -g postgres "$SRC_DIR/pg_hba.conf" "$CLUSTER_DIR/pg_hba.conf"
grep -qE "^[[:space:]]*start_conf[[:space:]]*=" "$CLUSTER_DIR/start.conf" \
  && sed -i -E 's/^[[:space:]]*start_conf.*/start_conf = manual/' "$CLUSTER_DIR/start.conf" \
  || echo "start_conf = manual" > "$CLUSTER_DIR/start.conf"
echo "   start.conf: $(grep -E '^start_conf' "$CLUSTER_DIR/start.conf")"

echo "== 6/6 TLS (selbstsigniert)"
if [ -s "$CLUSTER_DIR/server.crt" ] && [ -s "$CLUSTER_DIR/server.key" ]; then
  echo "   Zertifikat existiert bereits - unangetastet."
else
  "$SRC_DIR/make-tls-cert.sh" "$CLUSTER_DIR" "${PG_EXT_HOST:-141.244.222.191}"
fi

echo
echo "Fertig. Der Cluster ist angelegt, aber NICHT gestartet (start.conf = manual)."
echo "Nächster Schritt im Fenster: Container stoppen, dann"
echo "  systemctl start postgresql@$VERSION-$NAME"
echo "  runuser -u clxadmin -- psql -tAc 'select version()'"
