# Send-only mail for the dev instance (`claw`)

The dev instance sends mail as **`noreply@catchlogx.graf.priv.at`**. The domain
is a **send-only domain**: nothing is received, no mailbox exists, and the host
has no inbound SMTP port.

```
app (user catchlogx, 127.0.0.1:40873)
  → 127.0.0.1:25      postfix, inet_interfaces = loopback-only, no auth
  → OpenDKIM milter   inet:127.0.0.1:8891, Mode s, selector clx, d=catchlogx.graf.priv.at
  → recipient MX      direct delivery, opportunistic STARTTLS, IPv4 only
```

There is no smarthost: `claw` (Hetzner VPS, 85.215.162.182) delivers **directly**
to the recipient's MX. Two facts make that workable and were verified on
2026-11-10:

- **Outgoing port 25 is open** on this host (`gmail-smtp-in.l.google.com:25` and
  `mx.boku.ac.at:25` both connect).
- **The PTR is already correct**: `85.215.162.182` → `claw.graf.priv.at`, and
  `myhostname` is exactly that name, so HELO and reverse lookup agree.

The host has no global IPv6 address, and postfix is pinned to
`inet_protocols = ipv4` — a mail sent over an unregistered IPv6 address would
have no matching PTR.

Deliverability rests on four DNS facts (SPF, DKIM, DMARC, PTR); IP reputation is
the only factor this setup cannot configure. A fresh VPS IP therefore starts
with little reputation — that is expected and not a misconfiguration.

## DNS records (`mexx` repo, zone `graf.priv.at`)

The zone lives in the `mexx` Subversion repository (`~/svn/mexx/data`, tinydns
format). `catchlogx.graf.priv.at` is now an **A record, not a CNAME**: a CNAME
cannot coexist with the TXT records at the same name, and SPF/DKIM/DMARC all
live there.

```
+catchlogx.graf.priv.at:85.215.162.182:86400
'catchlogx.graf.priv.at:v=spf1 ip4\07285.215.162.182 -all:86400
'_dmarc.catchlogx.graf.priv.at:v=DMARC1; p=quarantine; adkim=s; aspf=s; rua=mailto\072postmaster@graf.priv.at:86400
'clx._domainkey.catchlogx.graf.priv.at:v=DKIM1; h=sha256; k=rsa; p=<public key>:86400
```

- **SPF** `ip4:85.215.162.182 -all` — hard fail for everything else. It is
  needed because the *parent* `graf.priv.at` record is
  `ip4:78.41.116.33 -all` (= `murl`), which does **not** cover `claw`; before
  this record every mail from the dev host failed SPF. A subdomain lookup does
  not fall back to the parent's SPF, so this record is the whole answer.
- **DKIM** selector `clx`, RSA 2048, `d=catchlogx.graf.priv.at`. The key lives
  on the host (`/etc/dkimkeys/clx.private`), never in this repository; only the
  public key is published.
- **DMARC** `p=quarantine` with **strict** alignment (`adkim=s; aspf=s`) — the
  sender domain is fixed, so strict is safe, and the only sender is the app,
  which always goes through the milter. Reports go to the existing
  `postmaster@graf.priv.at`. The rollout started at `p=none` on 2026-11-10 and
  was tightened on 2026-11-11 after Gmail reported
  `spf=pass dkim=pass dmarc=pass` for a real message. Consequence to keep in
  mind: if OpenDKIM is down, unsigned mail is now quarantined by receivers.
- **TTL 86400.** During the rollout the four records ran at TTL 600, because the
  old `CNAME` (TTL 86400) kept SPF/DMARC lookups at this name pointing at the
  alias for up to a day; the TTL was raised after that window closed
  (2026-11-10 22:44).
- **No MX record** — on purpose. djbdns cannot express a null MX (RFC 7505):
  generic `:` records reject type 15, and `@domain:.` synthesizes
  `mx.<domain>`. Without an MX, RFC 5321 falls back to the A record, where
  nothing listens on `:25`, so inbound mail fails as intended.

Publishing: the `mexx` pipeline copies `data` into `data.cdb` for **axfrdns**
(`murl:54`, ACL-restricted AXFR), `nsd/Makefile` pulls the zones and
`nsd-control reload` activates them; the second nameserver
`a.ns.priesch.priv.at` builds the same zone on its own. Edit `data` in the
working copy, commit, and wait for the pipeline — do **not** run `make`
elsewhere: `axfrzones.sh` would write empty zone files when the AXFR is refused
(only `78.41.116.*`, `193.238.157.*`, `137.208.89.122` are allowed).

After a `data` change, `murl`'s working copy shows the regenerated
`nsd/zones/*.zone` as modified (every zone gets a new SOA serial). Commit those
too, otherwise the tree stays dirty and a later commit of zones collides:
`sudo -u georg svn commit -m "nsd zones rebuilt" /home/georg/svn/mexx/nsd`.
The working copy on `murl` belongs to **`georg`** while `ssh murl` logs in as
`graf`, so the commit needs `sudo -u georg`; the edit/`make`/`reload` itself
runs as the cron user.

## Host configuration

Effective `postconf -n` and the OpenDKIM configuration are in this directory
(`main.cf.nondefault`, `opendkim.conf`, `keytable`, `signingtable`). Installing
from scratch:

```sh
debconf-set-selections <<EOF
postfix postfix/main_mailer_type select No configuration
postfix postfix/mailname string claw.graf.priv.at
EOF
DEBIAN_FRONTEND=noninteractive apt-get install -y postfix opendkim opendkim-tools swaks

cp /usr/share/postfix/main.cf.dist /etc/postfix/main.cf
postconf -e \
  "myhostname = claw.graf.priv.at" \
  "mydomain = graf.priv.at" \
  "myorigin = catchlogx.graf.priv.at" \
  "inet_interfaces = loopback-only" \
  "inet_protocols = ipv4" \
  "mydestination = \$myhostname, localhost" \
  "mynetworks = 127.0.0.0/8" \
  "relayhost =" \
  "smtp_tls_security_level = may" \
  "smtp_tls_CApath = /etc/ssl/certs" \
  "smtp_tls_loglevel = 1" \
  "disable_vrfy_command = yes" \
  "smtpd_helo_required = yes" \
  "smtpd_recipient_restrictions = permit_mynetworks, reject_unauth_destination" \
  "message_size_limit = 26214400" \
  "smtpd_milters = inet:127.0.0.1:8891" \
  "non_smtpd_milters = inet:127.0.0.1:8891" \
  "milter_default_action = accept" \
  "milter_protocol = 6" \
  "alias_maps = hash:/etc/aliases" \
  "alias_database = hash:/etc/aliases" \
  "compatibility_level = 3.6"

mkdir -p /etc/dkimkeys && chmod 755 /etc/dkimkeys
cd /etc/dkimkeys
opendkim-genkey -b 2048 -d catchlogx.graf.priv.at -s clx -D /etc/dkimkeys
chown opendkim:opendkim /etc/dkimkeys/clx.private
chmod 600 /etc/dkimkeys/clx.private
# keytable / signingtable: see the files in this directory
# opendkim.conf: see opendkim.conf in this directory

printf 'postmaster: root\n' > /etc/aliases && postalias /etc/aliases
postfix check && systemctl enable --now opendkim postfix
```

Why the individual pieces matter:

- **`inet_interfaces = loopback-only` + `mynetworks = 127.0.0.0/8` +
  `reject_unauth_destination`** — nothing is reachable from outside and the
  daemon is not an open relay, even if something on the host misbehaves.
- **`myhostname = claw.graf.priv.at`** — HELO must match the PTR.
- **`myorigin = catchlogx.graf.priv.at`** — cron/unit mail leaves the host with
  a sender in the send-only domain instead of `claw.graf.priv.at`.
- **inet milter socket** instead of a unix socket: no chroot path games.
- **`milter_default_action = accept`** — a dead milter must not stop mail (an
  unsigned mail is rejected by DMARC, but a swallowed mail is invisible).
- **`RequireSafeKeys no`** — OpenDKIM's "safe key" check walks every directory
  from `/` down to the key and refuses when one of them is group-writable with a
  group that has other users. On this host `/` is `root:georg 775` and `/etc` is
  `georg:georg 775`, so the check can never pass, regardless of where the key
  lives. The key itself is `0600 opendkim:opendkim`. The warning
  (`key data is not secure: …`) stays in the log by design — it is expected here.
- **`/etc/aliases` is local-only** (only `postmaster: root`): host reports stay
  in `/var/mail/<user>` and never leave the machine, like on production.

## DKIM key backup

The private key exists in exactly two places: `/etc/dkimkeys/clx.private` on
`claw` (0600 `opendkim:opendkim`) and the operator's **password store**:

```sh
export PASSWORD_STORE_DIR="$HOME/svn/georg/private/password-store"   # set in ~/.bashrc
pass show claw/dkim-clx-private
```

The store is an SVN working copy of the private `georg` repository
(`~/svn/georg/private/password-store`), so the key is versioned but encrypted
to the operator's GPG key (`EC23CFDFDDA530BD`); the entry is the raw
`clx.private` file, byte for byte.

- **Restoring after a lost host**: `pass show claw/dkim-clx-private >
  /etc/dkimkeys/clx.private`, `chown opendkim:opendkim`,
  `chmod 600`, `systemctl restart opendkim`. The published DNS record stays
  valid, so no DNS change and no mail outage.
- **The backup is only as good as the GPG key.** Without the secret key of
  `EC23CFDFDDA530BD` the entry is unreadable; that key needs its own offline
  backup.
- **Rotating**: generate a new key, replace the `p=` value in `mexx/data` for
  the same selector (`clx` is fine), commit, wait for the zone rebuild, restart
  the milter. Between those steps the published old key no longer matches the
  signing key — do it when no mail is expected.

## App side (#193 student part)

`lib/mailer.ts` supports an auth-less relay since #160. On `claw` the runtime
env (`/home/catchlogx/repos/georgernstgraf/CatchLogX/.env`) needs:

```
NODEMAILER_HOST=127.0.0.1
NODEMAILER_PORT=25
NODEMAILER_SECURE=false
NODEMAILER_FROM=noreply@catchlogx.graf.priv.at
# NODEMAILER_USER / NODEMAILER_PASSWORD: leave unset (setting only one is an error)
NEXT_PUBLIC_APP_URL=https://catchlogx.graf.priv.at
```

`NEXT_PUBLIC_APP_URL` is inlined at build time, so it only takes effect after a
redeploy (see `PITFALLS.md`) — a unit restart is not enough.

## Verify

```sh
ss -lntH | awk '{print $4}' | grep -E ':(25|8891)$'   # 127.0.0.1 only
opendkim-testkey -d catchlogx.graf.priv.at -s clx -vvv
swaks --server 127.0.0.1:25 --from noreply@catchlogx.graf.priv.at \
      --to <address> --header 'Subject: probe'
sleep 5; postqueue -p                                   # must be empty
grep -i opendkim /var/log/syslog | tail               # "DKIM-Signature field added"
dig +short TXT catchlogx.graf.priv.at @1.1.1.1
dig +short TXT clx._domainkey.catchlogx.graf.priv.at @1.1.1.1
```

For a full check, send to a real mailbox you control. Gmail's "Show original"
is the reference used on 2026-11-10: `Authentication-Results` showed
`dkim=pass header.s=clx`, `spf=pass` with `client-ip=85.215.162.182` and
`dmarc=pass (p=NONE)`, over TLS 1.3 — the message landed in the inbox.
