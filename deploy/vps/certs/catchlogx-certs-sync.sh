#!/bin/sh
# Kopiert Zertifikat und Privatkey der CatchLogX-VPS an einen Ort, den der
# catchlogx-User lesen kann (#167).
#
# Wird von Certbot als Deploy-Hook aufgerufen:
#   /etc/letsencrypt/renewal-hooks/deploy/catchlogx-certs-sync.sh
# Der Aufruf muss root sein und darf jederzeit beliebig oft erfolgen (auch von
# Hand, ohne Argumente) - das Skript ist idempotent.
set -eu
PATH=/usr/bin:/bin
export PATH

LINEAGE="${RENEWED_LINEAGE:-/etc/letsencrypt/live/catchlogx.graf.priv.at}"

# Deploy-Hooks laufen fuer JEDES Zertifikat dieser Maschine; RENEWED_LINEAGE
# nennt das gerade erneuerte. Alles ausser unserem eigenen ignorieren.
[ "$LINEAGE" = "/etc/letsencrypt/live/catchlogx.graf.priv.at" ] || exit 0

SRC=$LINEAGE
DST=/home/catchlogx/certs
OWNER=catchlogx

[ "$(id -u)" -eq 0 ] || { echo "catchlogx-certs-sync: must run as root" >&2; exit 1; }
for f in fullchain.pem privkey.pem; do
    [ -r "$SRC/$f" ] || { echo "catchlogx-certs-sync: $SRC/$f not readable" >&2; exit 1; }
done

umask 077
install -d -m 0750 -o "$OWNER" -g "$OWNER" "$DST"

# Atomar: erst in temporaere Dateien schreiben, dann umbenennen. So ist nie ein
# halb geschriebener Key oder ein Zert/Key-Mismatch sichtbar. cat (statt cp)
# folgt den Symlinks in live/ und liest damit immer die aktuelle Fassung.
tmp_cert=$(mktemp "$DST/.fullchain.pem.XXXXXX")
tmp_key=$(mktemp "$DST/.privkey.pem.XXXXXX")
trap 'rm -f "$tmp_cert" "$tmp_key"' EXIT INT TERM

cat "$SRC/fullchain.pem" > "$tmp_cert"
cat "$SRC/privkey.pem" > "$tmp_key"
chown "$OWNER:$OWNER" "$tmp_cert" "$tmp_key"
chmod 0644 "$tmp_cert"
chmod 0600 "$tmp_key"
mv -f "$tmp_cert" "$DST/fullchain.pem"
mv -f "$tmp_key" "$DST/privkey.pem"
trap - EXIT INT TERM

echo "catchlogx-certs-sync: refreshed $DST/fullchain.pem and $DST/privkey.pem"
