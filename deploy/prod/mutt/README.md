# mutt on the production host

Reads both mailboxes the operator needs, and sends through the local postfix:

| Box | Where | Key |
|---|---|---|
| BOKU GroupWise mailbox of the service account | `imaps://imap.boku.ac.at:993/` (INBOX, Sent Items, Work In Progress, Trash, Calendar, Tasklist, Cabinet) | `Ctrl-F` |
| Local root mailbox — the backup reports | `/var/mail/root` (mbox) | `Ctrl-L` |

`Ctrl-S` jumps to Sent Items. Run `mutt` (opens the BOKU INBOX) or
`mutt -f /var/mail/root`.

## Install

```sh
apt-get install -y mutt
install -m 600 deploy/prod/mutt/muttrc /root/.muttrc
mkdir -p /root/.cache/mutt && chmod 700 /root/.cache/mutt
```

Verify without a TTY:

```sh
mutt -F /root/.muttrc -Q imap_user      # imap_user="ihyam_catchlogx"
mutt -F /root/.muttrc -Q record         # record="=Sent Items"
```

## Why it looks like this

- **No second copy of the password.** `set imap_pass` runs a `sed` against
  `/etc/postfix/sasl_passwd` (0600 root), the single place that already holds
  the SMTP-auth password of the same account. Reading a different account means
  replacing exactly that one line.
- **No SMTP credentials in mutt.** `sendmail` is `/usr/sbin/sendmail`, i.e. the
  local postfix, which authenticates (STARTTLS + SASL) against
  `mailauth.boku.ac.at`. `from` must stay the account's own address — IronPort
  rejects foreign senders. See `../postfix/README.md`.
- **`set imap_idle = no`** — GroupWise does not implement IDLE; leaving it on
  makes mutt wait for something that never comes.
- **`set delete = no`** — GroupWise IMAP has no MOVE, so every deletion would be
  a copy+delete. Mark with `d`, purge occasionally with `$`.
- **`record`/`postponed`/`trash`** come from the server's own flags
  (`\Sent`, `\Drafts`, `\Trash`), not from guessed folder names — the folder
  list was queried with `curl imaps://…` on 2026-10-27.

## Note

The mailbox is the GroupWise *staff* system (Mitarbeiter-Mailing). Student mail
lives elsewhere (`short.boku.ac.at/it-studmail`) and is not reachable this way.
