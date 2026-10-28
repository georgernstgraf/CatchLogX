# TLS-Zertifikat für den `catchlogx`-User (#167)

nginx terminiert das TLS für `catchlogx.graf.priv.at` und proxied auf
`127.0.0.1:40873`; die Let's-Encrypt-Dateien liegen unter
`/etc/letsencrypt/live/catchlogx.graf.priv.at/` und sind für den User
`catchlogx` nicht erreichbar (`live/` und `archive/` sind `drwx------ root`).

`catchlogx-certs-sync.sh` legt nach jeder Erneuerung lesbare Kopien ab:

| Pfad | Rechte | Owner |
|---|---|---|
| `/home/catchlogx/certs/` | `0750` | `catchlogx:catchlogx` |
| `/home/catchlogx/certs/fullchain.pem` | `0644` | `catchlogx:catchlogx` |
| `/home/catchlogx/certs/privkey.pem` | `0600` | `catchlogx:catchlogx` |

Die Let's-Encrypt-Verzeichnisse werden **nicht** verändert — nginx liest
weiterhin direkt aus `live/`.

## Warum ein Deploy-Hook?

Certbot läuft mit `key_type = ecdsa` und **ohne** `--reuse-key`: bei jeder
Erneuerung entsteht ein neuer Privatkey (`archive/<domain>/privkeyN.pem`,
`0600 root`). Ein einmaliges `chmod`/`chgrp` wäre nach der ersten Erneuerung
wieder wirkungslos, ein Deploy-Hook nicht.

Deploy-Hooks laufen für **jedes** Zertifikat der Maschine. Deshalb prüft das
Skript `RENEWED_LINEAGE` und tut für fremde Lineages nichts (Exit 0).

## Installation

```sh
sudo install -o root -g root -m 0755 \
  deploy/vps/certs/catchlogx-certs-sync.sh \
  /etc/letsencrypt/renewal-hooks/deploy/catchlogx-certs-sync.sh
```

Erster Lauf von Hand (der Hook feuert sonst erst bei der nächsten echten
Erneuerung — das Zertifikat ist bis 2027-01-13 gültig):

```sh
sudo /etc/letsencrypt/renewal-hooks/deploy/catchlogx-certs-sync.sh
```

## Verifikation

```sh
ls -l /home/catchlogx/certs/

# Lesetest als Zieluser
sudo -u catchlogx openssl x509 -in /home/catchlogx/certs/fullchain.pem \
  -noout -subject -enddate
sudo -u catchlogx test -r /home/catchlogx/certs/privkey.pem && echo key-ok

# Zertifikat und Key gehoeren zusammen (beide Hashes muessen gleich sein)
openssl x509 -in /home/catchlogx/certs/fullchain.pem -noout -pubkey | openssl sha256
openssl pkey -in /home/catchlogx/certs/privkey.pem -pubout | openssl sha256

# Guard: fremde Lineage darf nichts anfassen (mtimes unveraendert, Exit 0)
sudo RENEWED_LINEAGE=/etc/letsencrypt/live/claw.graf.priv.at \
  /etc/letsencrypt/renewal-hooks/deploy/catchlogx-certs-sync.sh

# Nachweis beim naechsten Timer-Lauf
journalctl -u certbot.service --since today | grep catchlogx-certs-sync
```

**Nicht** als Test geeignet: `certbot renew --dry-run --run-deploy-hooks` —
der Dry-Run stellt ein Staging-Zertifikat in eine temporäre Lineage, der Guard
überspringt dann korrekt, der Kopierpfad wird also gar nicht geprüft.

## Sicherheitshinweis

Der Privatkey wird für alles lesbar, was als `catchlogx` läuft — inklusive der
OpenCode-Instanz und des Telegram-Bot-Backends auf diesem User. Ein
prompt-injizierter Agent könnte damit `catchlogx.graf.priv.at` impersonieren.
Bewusst akzeptiert für die Dev-Instanz; der Key bleibt `0600` und existiert nur
in diesem einen Pfad (keine Kopien in `~/releases/`).

## Deinstallation

```sh
sudo rm /etc/letsencrypt/renewal-hooks/deploy/catchlogx-certs-sync.sh
sudo rm -rf /home/catchlogx/certs
```

nginx und die Let's-Encrypt-Struktur sind davon nicht betroffen.
