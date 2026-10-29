#!/usr/bin/env bash
# Self-signed TLS certificate for the production PostgreSQL cluster (#170).
#
# Why self-signed: the BOKUnet has no CA that could vouch for this host, and a
# Let's-Encrypt-style path needs a public name we do not have. A self-signed
# certificate still gives encryption; verification is what it cannot give, so
# clients use sslmode=require (encrypt, do not verify) instead of verify-full.
#
# The certificate is offered, not enforced: `ssl = on` in 99-catchlogx.conf.
# libpq clients default to sslmode=prefer and therefore encrypt automatically.
#
# Usage (as root):
#   ./make-tls-cert.sh [cluster-dir] [ip]
# Defaults: /etc/postgresql/16/main and 141.244.222.191.
#
# Renewal: valid for 10 years by design - there is no automation on this host
# (unlike dev, which syncs the Let's Encrypt copy). Regenerating the cert is a
# `systemctl reload postgresql@16-main` - existing sessions keep their TLS.

set -euo pipefail

DIR="${1:-/etc/postgresql/16/main}"
IP="${2:-141.244.222.191}"
HOST="$(hostname -s)"

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
[ -d "$DIR" ] || { echo "no such cluster directory: $DIR" >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl fehlt" >&2; exit 1; }

umask 077
openssl req -new -x509 -days 3650 -nodes -sha256 \
  -out "$DIR/server.crt" -keyout "$DIR/server.key" \
  -subj "/CN=$IP" \
  -addext "subjectAltName=IP:$IP,DNS:$HOST" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

# Postgres refuses to start when the key is group- or world-readable.
chown postgres:postgres "$DIR/server.crt" "$DIR/server.key"
chmod 644 "$DIR/server.crt"
chmod 600 "$DIR/server.key"

echo "TLS material written to $DIR/server.{crt,key} (CN=$IP, SAN=$IP,$HOST, 10 years)."
echo "Verify: openssl x509 -in $DIR/server.crt -noout -subject -dates -ext subjectAltName"
