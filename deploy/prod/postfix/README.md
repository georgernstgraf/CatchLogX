# Local mail transport (BOKU host)

The production host has no route to the internet on SMTP ports except port 25
to BOKU's own mail servers (verified 2026-10-27: `mail`/`mx`/`mx1.boku.ac.at`:25
open, everything else on 25/465/587 blocked — including the VPS and Gmail).
So the host runs its own postfix that accepts mail **only on loopback** and
relays it authenticated to the BOKU smarthost.

```
app / scripts → 127.0.0.1:25 → postfix → STARTTLS + SASL → mailauth.boku.ac.at:25 → mailbox
```

Two consumers: `catchlogx-backup` (backup and restore-probe reports) and the
app itself once #160 is closed (`NODEMAILER_HOST=127.0.0.1`, `PORT=25`, no auth
— the credential lives in postfix only).

## Smarthost facts

| Property | Value |
|---|---|
| Host | `mailauth.boku.ac.at` (141.244.187.85, Cisco IronPort `ironport01-smtpauth`) |
| Port | 25, plaintext first, then `STARTTLS` |
| Certificate | valid chain (GEANT TLS RSA 1 → HARICA root), SAN includes `mailauth.boku.ac.at` → `smtp_tls_security_level = verify` works |
| Auth | `PLAIN LOGIN`, advertised **only after** STARTTLS |
| Limit | `SIZE 52428800` — 50 MB per message. Never mail a database dump (54 MB and growing); data travels as the encrypted off-site upload. |
| Sender | must match the authenticated account (IronPort rewrites/rejects otherwise) |

## Effective configuration (`postconf -n`, non-default only)

`main.cf.nondefault` in this directory is the snapshot taken on the host on
2026-10-27. Reproduce it with:

```sh
cp -n /usr/share/postfix/main.cf.dist /etc/postfix/main.cf
postconf -e \
  "myhostname = catchlogx-server.boku.ac.at" \
  "mydomain = boku.ac.at" \
  "myorigin = \$myhostname" \
  "inet_interfaces = loopback-only" \
  "inet_protocols = ipv4" \
  "mydestination = \$myhostname, localhost" \
  "mynetworks = 127.0.0.0/8" \
  "relayhost = [mailauth.boku.ac.at]:25" \
  "smtp_tls_CApath = /etc/ssl/certs" \
  "smtp_tls_security_level = verify" \
  "smtp_tls_loglevel = 1" \
  "smtp_sasl_auth_enable = yes" \
  "smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd" \
  "smtp_sasl_security_options = noanonymous" \
  "smtp_sasl_tls_security_options = noanonymous" \
  "smtpd_recipient_restrictions = permit_mynetworks, reject_unauth_destination" \
  "disable_vrfy_command = yes" \
  "smtpd_helo_required = yes" \
  "alias_maps = hash:/etc/aliases" \
  "alias_database = hash:/etc/aliases" \
  "compatibility_level = 3.6"
postconf -F "smtp/unix/chroot = n"   # else the smtp client cannot read /etc/ssl/certs
postfix check && systemctl enable --now postfix
```

Why the individual lines matter:

- `inet_interfaces = loopback-only` — the listener is `127.0.0.1:25` only; no
  port is opened on the network.
- `mydestination = $myhostname, localhost` — mail to `root@<host>` is matched
  locally first, so `/etc/aliases` can forward it out; without this the hostname
  would fall through to the relay and bounce.
- `smtp_tls_CApath` — postfix has **no** default CA path; without it `verify`
  silently degrades to "untrusted issuer" and nothing is verified.
- `smtp/unix/chroot = n` — the Debian default chroots the smtp client, which
  then cannot see `/etc/ssl/certs`; keeping it unchrooted is what makes
  `smtp_tls_security_level = verify` work.
- `reject_unauth_destination` + `mynetworks = 127.0.0.0/8` — no open relay, even
  if something on the host goes wrong.

## Credentials (never in this repository)

**Scope:** this relay is for mail the *app* sends to real recipients (#160,
password reset). Host reports (backups, unit failures) are delivered **locally**
into `/var/mail/root` and never touch it — see `../backup/README.md`. Keeping
the two apart means a broken SMTP account cannot silence the backup reports,
and a mail outage cannot be confused with a backup outage.

`/etc/postfix/sasl_passwd`, mode `600 root:root`, generated file `…​.db` mode
`640 root:postfix`:

```
[mailauth.boku.ac.at]:25 BENUTZER:PASSWORT
```

Set them on the machine with `/root/set-mail-auth.sh` (reads the password from
the terminal, writes the file, runs `postmap`, reloads postfix). The account is
a BOKU SMTP-auth account and its address is the sender for every message.

`/etc/aliases` must forward the local root mail (cron, unit failures) **if** it
should leave the machine. A `No configuration` postfix install does not create
the file. For the current setup it is deliberately empty (only comments): the
reports stay in `/var/mail/root` instead of being relayed, because there is no
external mailbox to read them from.

```
root: <boku-address>
```

then `postalias /etc/aliases`. Verify the rewrite in the log: the delivery line
shows `orig_to=<root>` next to the external `to=<…>`.

## Verified on 2026-10-27

Account `ihyam_catchlogx` (service account, 10-character password), sender
`ihyam_catchlogx@boku.ac.at` — accepted, so the sender address must be the
account's own address:

```
postfix/smtp[…]: Verified TLS connection established to mailauth.boku.ac.at[141.244.187.85]:25: TLSv1.2 with cipher ECDHE-RSA-AES256-GCM-SHA384 (256/256 bits)
postfix/smtp[…]: … to=<…@boku.ac.at>, relay=mailauth.boku.ac.at[141.244.187.85]:25, … status=sent (250 ok: Message … accepted)
```

`postqueue -p` empty afterwards. The relay carried the first test mails; the
backup and alert reports then moved to local delivery (`relay=local … delivered
to mailbox`, `/var/mail/root`), which is the mode that runs in production — the
external path is proven but not on the critical reporting route.

## Verify

```sh
ss -lntH | awk '{print $4}' | grep ':25$'        # must be 127.0.0.1:25 only
posttls-finger -l verify -P /etc/ssl/certs -c mailauth.boku.ac.at:25 | head -3
printf 'Subject: probe\n\nprobe\n' | sendmail -oi -f catchlogx@boku.ac.at <boku-address>
sleep 5; postqueue -p          # must be empty
tail -20 /var/log/mail.log     # "status=sent (250 …)"
```

The first real send is also the proof that IronPort accepts us: `mail.log`
shows either `Verified TLS connection established` + `250 2.0.0 Ok: queued` or
the reason it refused (typically `Sender address rejected` → wrong `MAIL_FROM`).
