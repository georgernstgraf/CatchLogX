#!/usr/bin/env bash
# CatchLogX production backup (#86).
#
# One script, four modes:
#   run            daily backup: dump, verify, encrypt the env, prune, push off-site
#   probe          monthly restore rehearsal: restore the newest set into a scratch
#                  database and compare it against the row counts recorded at dump time
#   status         human-readable state: sets, ages, last results, config warnings
#   notify-failure called by catchlogx-alert@<unit>.service (systemd OnFailure)
#
# Configuration comes from /etc/catchlogx-backup.env (mode 600, root) via the
# systemd units; see README.md. Nothing here needs the database password: the
# units run as the OS user `clxadmin`, and the native cluster (#170) maps that
# OS user to the DB role of the same name via `local all clxadmin peer` in
# pg_hba.conf. The socket is the only path used - never TCP, never a password.
#
# Never put a database dump into a mail. The BOKU relay refuses messages over
# 50 MB, and the mail is a status line - the data travels as an off-site upload.

set -euo pipefail
umask 077

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

# Load the machine configuration when the script is run by hand. The systemd
# units inject the same file through EnvironmentFile, so sourcing it here is
# idempotent - but it matters for `status`: without it a manual run reported the
# defaults ("off-site not configured", "no mail target") while everything was in
# fact configured. The diagnostic must not lie.
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/catchlogx-backup.env}"
if [ -r "$BACKUP_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090  # path comes from the environment, on purpose
  . "$BACKUP_ENV_FILE"
  set +a
fi

PG_USER="${PG_USER:-clxadmin}"
PG_DB="${PG_DB:-clx}"
PG_RESTORE_DB="${PG_RESTORE_DB:-clx_restore_probe}"

# Absolute default on purpose: a manual `status` run as root must not look in
# /root, and the sets have to stay where the one-off maintenance jobs put them.
BACKUP_ROOT="${BACKUP_ROOT:-/home/clxadmin/catchlogx-backups}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_MONTHLY="${KEEP_MONTHLY:-3}"
APP_ENV_FILE="${APP_ENV_FILE:-/home/clxadmin/.config/catchlogx/.env}"

BACKUP_AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"
OFFSITE_URL="${OFFSITE_URL:-}"
OFFSITE_USER="${OFFSITE_USER:-}"
OFFSITE_PASSWORD="${OFFSITE_PASSWORD:-}"

MAIL_TO="${MAIL_TO:-}"
MAIL_COPY_TO="${MAIL_COPY_TO:-}"
MAIL_FROM="${MAIL_FROM:-catchlogx@boku.ac.at}"
SENDMAIL="${SENDMAIL:-/usr/sbin/sendmail}"

# Row counts compared by `probe`. The restore must reproduce the dump exactly;
# current production is expected to differ (the dump is up to a day old).
TABLES=(
  "User"
  "Session"
  "PasswordResets"
  "Uploads"
  "TemplateFiles"
  "FileBlob"
  "UserQueries"
  "fish_species"
  "river_sites"
  "samplings"
  "fish_catches"
)

log() {
  # systemd captures stderr into the journal, so no logger(1) call: that would
  # duplicate every line in `journalctl -u catchlogx-backup`.
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

die() {
  log "FEHLER: $*"
  exit 1
}

now_stamp() { date -u +%Y%m%dT%H%M%SZ; }

# ---------------------------------------------------------------- mail -------

send_mail() {
  local subject="$1" body="$2"
  local -a rcpt=()
  # MAIL_TO is the primary target (the local root mailbox), MAIL_COPY_TO is an
  # optional second copy that postfix relays out. One message, two recipients:
  # postfix delivers each one independently, so a broken SMTP account cannot
  # keep the local report from arriving.
  [ -n "$MAIL_TO" ] && rcpt+=("$MAIL_TO")
  [ -n "$MAIL_COPY_TO" ] && rcpt+=("$MAIL_COPY_TO")
  if [ ${#rcpt[@]} -eq 0 ]; then
    log "mail: weder MAIL_TO noch MAIL_COPY_TO gesetzt - Meldung bleibt im journald"
    return 0
  fi
  if [ ! -x "$SENDMAIL" ]; then
    log "mail: $SENDMAIL fehlt - Meldung bleibt im journald"
    return 0
  fi
  printf 'From: %s\nTo: %s\nSubject: %s\nDate: %s\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\n%s\n' \
    "$MAIL_FROM" "${rcpt[*]}" "$subject" "$(date -R)" "$body" \
    | "$SENDMAIL" -oi -f "$MAIL_FROM" "${rcpt[@]}" \
    || log "mail: Versand an ${rcpt[*]} fehlgeschlagen (siehe /var/log/mail.log)"
}

# --------------------------------------------------------------- helpers -----

pg() {
  # $1 = database, rest = psql arguments.
  # `-w` refuses to prompt: there is no tty under systemd, and a peer-auth
  # misconfiguration must fail immediately instead of waiting for a password.
  local db="$1"; shift
  psql -X -q -w -U "$PG_USER" -d "$db" "$@"
}

pgdump() {
  # $1 = database, rest = pg_dump arguments (writes to stdout)
  local db="$1"; shift
  pg_dump -w -U "$PG_USER" -d "$db" "$@"
}

newest_set() {
  # Newest set (by mtime) that contains all required files (default: a
  # verified dump). Lexical order would rank `pre-apt-…` above every timestamp,
  # so both the ordering and the required files matter: legacy sets carry no
  # rowcounts.txt and are never probed automatically.
  local req=("$@") s f ok
  [ ${#req[@]} -gt 0 ] || req=("db.dump")
  for s in $(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -rn | cut -d' ' -f2-); do
    ok=1
    for f in "${req[@]}"; do
      [ -s "$BACKUP_ROOT/$s/$f" ] || { ok=0; break; }
    done
    if [ "$ok" = 1 ]; then
      printf '%s' "$s"
      return 0
    fi
  done
  return 1
}

set_size() {
  du -sh "$BACKUP_ROOT/$1" 2>/dev/null | cut -f1 || printf '?'
}

age_hours() {
  local t0 now
  t0=$(date -d "$1" +%s 2>/dev/null) || { printf '?'; return; }
  now=$(date +%s)
  printf '%s' $(( (now - t0) / 3600 ))
}

write_json_result() {
  local file="$1" status="$2"; shift 2
  {
    printf '{\n  "finishedAt": "%s",\n  "status": "%s"' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$status"
    local kv
    for kv in "$@"; do
      printf ',\n  "%s": "%s"' "${kv%%=*}" "${kv#*=}"
    done
    printf '\n}\n'
  } > "$BACKUP_ROOT/$file"
}

# ----------------------------------------------------------------- run -------

cmd_run() {
  local started stamp dest counts blobs offsite_note="nicht konfiguriert"
  started=$(date +%s)
  stamp=$(now_stamp)
  dest="$BACKUP_ROOT/$stamp"

  log "run: start, Ziel $dest"
  mkdir -p "$dest"

  # The cluster, not a container, is the precondition since #170.
  pg_isready -q || die "PostgreSQL ist nicht erreichbar (systemctl status postgresql@16-main)"

  # 1. Dump over the local socket (peer auth as clxadmin, no password).
  if ! pgdump "$PG_DB" -Fc > "$dest/db.dump"; then
    rm -rf -- "$dest"
    die "pg_dump fehlgeschlagen"
  fi
  if [ ! -s "$dest/db.dump" ]; then
    rm -rf -- "$dest"
    die "db.dump ist leer"
  fi

  # 2. Never trust an archive that was not listed. The listing doubles as the
  #    table-of-contents needed for a selective restore.
  pg_restore --list "$dest/db.dump" > "$dest/db.dump.list" \
    || die "pg_restore --list fehlgeschlagen (Dump unbrauchbar)"
  [ -s "$dest/db.dump.list" ] || die "db.dump.list ist leer"

  # 3. Row counts as of the dump. `probe` compares the restored copy against
  #    these numbers, not against live production (which moves on).
  counts="$dest/rowcounts.txt"
  : > "$counts"
  local t n
  for t in "${TABLES[@]}"; do
    n=$(pg "$PG_DB" -tAc "select count(*) from \"$t\"" 2>/dev/null) || die "Zeilen zählen fehlgeschlagen: $t"
    printf '%s=%s\n' "$t" "$n" >> "$counts"
  done
  blobs=$(pg "$PG_DB" -tAc 'select coalesce(sum(length(data)),0) from "FileBlob"') \
    || die "Blob-Summe fehlgeschlagen"
  printf 'FileBlob.bytes=%s\n' "$blobs" >> "$counts"

  # 4. The env file holds the only copies of DATABASE_URL, NEXTAUTH_SECRET and
  #    READONLY_DB_PASSWORD. Encrypted only - the age identity stays off-host.
  if [ -n "$BACKUP_AGE_RECIPIENT" ]; then
    if [ -r "$APP_ENV_FILE" ]; then
      age -r "$BACKUP_AGE_RECIPIENT" -o "$dest/env.age" "$APP_ENV_FILE" \
        || die "age-Verschlüsselung von $APP_ENV_FILE fehlgeschlagen"
    else
      log "warnung: $APP_ENV_FILE nicht lesbar - kein env.age"
    fi
  else
    log "warnung: BACKUP_AGE_RECIPIENT nicht gesetzt - env.age wird nicht erzeugt"
  fi

  # 5. Checksums over everything the set contains.
  ( cd "$dest" && sha256sum db.dump db.dump.list rowcounts.txt env.age 2>/dev/null > SHA256SUMS ) \
    || ( cd "$dest" && sha256sum db.dump db.dump.list rowcounts.txt > SHA256SUMS )

  log "run: Dump verifiziert ($(du -h "$dest/db.dump" | cut -f1), $(wc -l < "$dest/db.dump.list") Einträge)"

  # 6. Off-site before pruning, so a failed upload never costs the local copy.
  if [ -n "$OFFSITE_URL" ]; then
    offsite_note=$(upload_offsite "$stamp") || die "Off-site-Upload fehlgeschlagen"
  fi

  prune || log "warnung: Aufräumen unvollständig"

  local dur=$(( $(date +%s) - started ))
  write_json_result "last-run.json" "ok" \
    "stamp=$stamp" "durationSeconds=$dur" "dumpSize=$(du -h "$dest/db.dump" | cut -f1)" \
    "fileBlobBytes=$blobs" "offsite=$offsite_note"
  log "run: fertig in ${dur}s"

  send_mail "CatchLogX Backup ok ($stamp)" \
"Backup $stamp erfolgreich.

Dump:        $(du -h "$dest/db.dump" | cut -f1)  ($(wc -l < "$dest/db.dump.list") Einträge in der Sicherungsliste)
Fänge:       $(awk -F= '/^fish_catches=/{print $2}' "$counts")
Dateien:     $(awk -F= '/^FileBlob=/{print $2}' "$counts") Blobs, $(awk -F= '/^FileBlob.bytes=/{print $2}' "$counts") Bytes
env.age:     $([ -s "$dest/env.age" ] && echo "vorhanden" || echo "FEHLT")
Off-site:    $offsite_note
Dauer:       ${dur}s
Aufbewahrt:  $(ls -1d "$BACKUP_ROOT"/20* 2>/dev/null | wc -l) Sätze unter $BACKUP_ROOT

Die monatliche Restore-Probe läuft am 1. um 04:30 UTC."
}

# --------------------------------------------------------------- offsite -----

upload_offsite() {
  local stamp="$1" tmp name size remote_size
  [ -n "$BACKUP_AGE_RECIPIENT" ] || die "Off-site ist konfiguriert, aber BACKUP_AGE_RECIPIENT fehlt (Off-site wird immer verschlüsselt)"
  command -v age >/dev/null || die "age fehlt"
  command -v curl >/dev/null || die "curl fehlt"

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN

  # One encrypted tar: nothing readable on the VPS, not even the fish data or
  # the password hashes in the dump.
  tar -C "$BACKUP_ROOT" -cf - "$stamp" | zstd -q -19 -T0 | age -r "$BACKUP_AGE_RECIPIENT" -o "$tmp/$stamp.tar.zst.age" \
    || die "Archivierung/Verschlüsselung fehlgeschlagen"

  name="$stamp.tar.zst.age"
  size=$(stat -c%s "$tmp/$name")
  ( cd "$tmp" && sha256sum "$name" > "$name.sha256" )

  curl -fsS --retry 3 --retry-delay 15 --max-time 1800 \
    --user "$OFFSITE_USER:$OFFSITE_PASSWORD" \
    -T "$tmp/$name" "$OFFSITE_URL" \
    || die "Upload von $name fehlgeschlagen"
  curl -fsS --retry 3 --retry-delay 15 --max-time 300 \
    --user "$OFFSITE_USER:$OFFSITE_PASSWORD" \
    -T "$tmp/$name.sha256" "$OFFSITE_URL" \
    || die "Upload der Prüfsumme fehlgeschlagen"

  # Trust nothing: the remote object must have exactly our byte count.
  remote_size=$(curl -fsS --max-time 120 --user "$OFFSITE_USER:$OFFSITE_PASSWORD" \
    -I "$OFFSITE_URL$name" | awk 'tolower($1)=="content-length:"{print $2}' | tr -d '\r' | tail -n1)
  [ "$remote_size" = "$size" ] \
    || die "Größenprüfung fehlgeschlagen: lokal $size, off-site ${remote_size:-unbekannt}"

  write_json_result "last-offsite.json" "ok" "stamp=$stamp" "name=$name" "bytes=$size"
  log "offsite: $name ($size Bytes) hochgeladen und geprüft"
  printf '%s (%s Bytes, geprüft)' "$name" "$size"
}

# ----------------------------------------------------------------- prune -----

prune() {
  local keep_daily="$KEEP_DAILY" keep_monthly="$KEEP_MONTHLY"
  local -A keep=()
  local d=0 m=0 removed=0 s

  for s in $(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r); do
    # Only our own timestamped sets are candidates; hand-made sets such as
    # `cutover-…` or `pre-apt-…` are never touched.
    case "$s" in
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
      *) continue ;;
    esac
    if [ "$d" -lt "$keep_daily" ]; then
      keep[$s]=1; d=$((d + 1)); continue
    fi
    if [ "${s:6:2}" = "01" ] && [ "$m" -lt "$keep_monthly" ]; then
      keep[$s]=1; m=$((m + 1)); continue
    fi
    rm -rf -- "${BACKUP_ROOT:?}/$s" && removed=$((removed + 1))
  done

  log "prune: $removed Satz/Sätze entfernt, ${#keep[@]} behalten (${d}x täglich, ${m}x monatlich)"
}

# ----------------------------------------------------------------- probe -----

cmd_probe() {
  local set started dur counts_diff="" failures=0 live_compared
  started=$(date +%s)
  set=$(newest_set db.dump rowcounts.txt) || die "kein Sicherungssatz mit db.dump + rowcounts.txt gefunden"
  log "probe: prüfe $set"

  pg postgres -tAc "select 1" >/dev/null || die "Datenbank nicht erreichbar"

  # The scratch database never survives this function - not even on a crash in
  # the middle of the comparison.
  drop_scratch() { pg postgres -q -c "drop database if exists \"$PG_RESTORE_DB\"" >/dev/null 2>&1 || true; }
  trap drop_scratch EXIT

  # Scratch database, dropped even if the restore fails.
  drop_scratch
  pg postgres -q -c "create database \"$PG_RESTORE_DB\"" >/dev/null
  if ! pg_restore -w -U "$PG_USER" -d "$PG_RESTORE_DB" \
        --no-owner --no-privileges < "$BACKUP_ROOT/$set/db.dump" 2>/dev/null; then
    write_json_result "last-probe.json" "failed" "set=$set" "reason=pg_restore"
    die "pg_restore in $PG_RESTORE_DB fehlgeschlagen"
  fi

  # Compare the restored copy against the numbers recorded when the dump was
  # taken. Live production is reported only as context - it has moved on.
  local line key expected actual
  while IFS= read -r line; do
    key="${line%%=*}"; expected="${line#*=}"
    if [ "$key" = "FileBlob.bytes" ]; then
      actual=$(pg "$PG_RESTORE_DB" -tAc 'select coalesce(sum(length(data)),0) from "FileBlob"')
    else
      actual=$(pg "$PG_RESTORE_DB" -tAc "select count(*) from \"$key\"")
    fi
    if [ "$actual" != "$expected" ]; then
      failures=$((failures + 1))
      counts_diff+="$key: erwartet $expected, wiederhergestellt $actual"$'\n'
    fi
  done < "$BACKUP_ROOT/$set/rowcounts.txt"

  live_compared="$(pg "$PG_DB" -tAc 'select count(*) from "fish_catches"') Fänge live, $(pg "$PG_DB" -tAc 'select count(*) from "FileBlob"') Blobs live"

  drop_scratch

  dur=$(( $(date +%s) - started ))

  if [ "$failures" -gt 0 ]; then
    write_json_result "last-probe.json" "failed" "set=$set" "mismatches=$failures" "durationSeconds=$dur"
    send_mail "CatchLogX Restore-Probe FEHLGESCHLAGEN ($set)" \
"Die Wiederherstellung von $set weicht vom Original ab:

$counts_diff
Die Scratch-Datenbank $PG_RESTORE_DB wurde entfernt. Der Satz liegt unverändert
unter $BACKUP_ROOT/$set - bitte vor dem nächsten Lauf prüfen, ob Plattenplatz
oder Dump-Erzeugung die Ursache sind."
    die "Restore-Probe: $failures Abweichung(en)"
  fi

  write_json_result "last-probe.json" "ok" "set=$set" "durationSeconds=$dur"
  log "probe: ok ($set, ${dur}s)"

  send_mail "CatchLogX Restore-Probe ok ($set)" \
"Der Satz $set wurde vollständig zurückgespielt und stimmt zeichengenau:

Alle $(wc -l < "$BACKUP_ROOT/$set/rowcounts.txt") Zählwerte identisch, inklusive
der Blob-Bytesumme (abgeschnittene Dateien würden hier auffallen).

Zum Vergleich, aktueller Stand: $live_compared
Dauer: ${dur}s

Hinweis: env.age wird hier nur strukturell geprüft. Den Schlüssel-Test
(age -d mit deinem privaten Key) startest du selbst mit
  backup.sh keycheck <identity-datei>"
}

# --------------------------------------------------------------- keycheck ----

cmd_keycheck() {
  local identity="${1:-}" set
  [ -n "$identity" ] || die "Aufruf: backup.sh keycheck <private-key-datei>"
  [ -r "$identity" ] || die "Identity nicht lesbar: $identity"
  set=$(newest_set db.dump env.age) || die "kein Sicherungssatz mit env.age gefunden"
  [ -s "$BACKUP_ROOT/$set/env.age" ] || die "$set enthält kein env.age"

  local plain count
  plain=$(age -d -i "$identity" "$BACKUP_ROOT/$set/env.age") || die "Entschlüsselung fehlgeschlagen - falscher Key?"
  count=$(printf '%s\n' "$plain" | grep -cE '^(DATABASE_URL|NEXTAUTH_SECRET)=' || true)
  unset plain
  [ "$count" -ge 2 ] || die "entschlüsselte Datei enthält nicht die erwarteten Schlüssel"

  log "keycheck: ok ($set/env.age lässt sich mit $identity öffnen)"
  printf 'keycheck ok: %s/env.age ist mit %s entschlüsselbar\n' "$set" "$identity"
}

# ---------------------------------------------------------------- status -----

cmd_status() {
  local newest age_h
  printf 'Sicherungssätze unter %s (neueste zuerst)\n\n' "$BACKUP_ROOT"
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -rn | cut -d' ' -f2- |
  while read -r s; do
    printf '  %-26s %8s  %s\n' "$s" "$(set_size "$s")" \
      "$([ -s "$BACKUP_ROOT/$s/db.dump" ] && echo "db.dump $(du -h "$BACKUP_ROOT/$s/db.dump" | cut -f1)" || echo "kein Dump")"
  done

  printf '\nLetzte Läufe\n'
  for f in last-run.json last-probe.json last-offsite.json; do
    if [ -r "$BACKUP_ROOT/$f" ]; then
      printf '  %-18s %s\n' "$f" "$(tr -d '\n' < "$BACKUP_ROOT/$f" | sed 's/  */ /g')"
    else
      printf '  %-18s -\n' "$f"
    fi
  done

  if newest=$(newest_set); then
    age_h=$(age_hours "$(stat -c %y "$BACKUP_ROOT/$newest/db.dump" 2>/dev/null)")
    printf '\nJüngster Satz: %s (%s h alt)\n' "$newest" "$age_h"
    case "$age_h" in
      ''|*[!0-9]*) printf '  WARNUNG: Alter nicht bestimmbar\n' ;;
      *) [ "$age_h" -le 26 ] || printf '  WARNUNG: älter als 26 h - Timer prüfen (systemctl list-timers)\n' ;;
    esac
  else
    printf '\nWARNUNG: kein Sicherungssatz mit db.dump vorhanden\n'
  fi

  printf '\nKonfiguration\n'
  printf '  Aufbewahrung   %s täglich / %s monatlich\n' "$KEEP_DAILY" "$KEEP_MONTHLY"
  printf '  Off-site       %s\n' "${OFFSITE_URL:-NICHT KONFIGURIERT (nur lokal)}"
  printf '  age-Recipient  %s\n' "${BACKUP_AGE_RECIPIENT:-NICHT GESETZT (env.age entfällt)}"
  printf '  Mailziel       %s\n' "${MAIL_TO:-NICHT GESETZT (nur journald)}"

  printf '\nTimer\n'
  systemctl list-timers 'catchlogx-backup*' --no-pager 2>/dev/null | sed 's/^/  /' || true
}

# ----------------------------------------------------------- notify-failure --

cmd_notify_failure() {
  local unit="${1:-unbekannt}" tail_txt
  tail_txt=$(journalctl -u "$unit" -n 40 --no-pager 2>/dev/null | tail -40 || true)
  log "notify-failure: $unit"
  send_mail "CatchLogX: $unit fehlgeschlagen" \
"Die Unit $unit ist fehlgeschlagen.

Letzte Zeilen aus dem Journal:
---------------------------------------------------------------
$tail_txt
---------------------------------------------------------------

Auf der Maschine prüfen:
  systemctl status $unit
  /usr/local/bin/catchlogx-backup status"
}

# ------------------------------------------------------------------ main -----

case "${1:-}" in
  run)             cmd_run ;;
  probe)           cmd_probe ;;
  status)          cmd_status ;;
  keycheck)        shift; cmd_keycheck "$@" ;;
  notify-failure)  shift; cmd_notify_failure "$@" ;;
  *)
    printf 'usage: %s {run|probe|status|keycheck <identity>|notify-failure <unit>}\n' "${0##*/}" >&2
    exit 2
    ;;
esac
