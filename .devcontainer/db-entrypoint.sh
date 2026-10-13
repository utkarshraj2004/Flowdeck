#!/bin/sh
# Entrypoint of the codespace's PostgreSQL container (postgres:16-alpine; starts as root, PostgreSQL runs as uid 70).
# Prepares .codespace-data (mounted at /state), keeps the generated password, copies the database log to
# .codespace-data/run/db.log so 'flowdeck status' can show it, and repairs a role password or a missing
# database left by an interrupted first start. It never deletes or resets data.
set -eu
umask 022

# Docker may create a missing bind-mount folder as root, possibly with a restrictive mode. Hand it to the
# workspace user (uid 1000) and keep /state enterable for PostgreSQL (uid 70); otherwise its entrypoint fails
# with "mkdir: can't create directory '/state/postgres': Permission denied" and restarts forever.
mkdir -p /state/secrets /state/app /state/run
chown 1000:1000 /state /state/secrets /state/app /state/run
chmod 755 /state /state/app /state/run

# Copy everything printed from here on to .codespace-data/run/db.log (and still to the container log).
log=/state/run/db.log
if [ -f "$log" ] && [ "$(wc -c <"$log")" -gt 1048576 ]; then mv -f "$log" "$log.1"; fi
touch "$log" && chown 1000:1000 "$log"
rm -f /tmp/db-log.fifo && mkfifo /tmp/db-log.fifo
tee -a "$log" </tmp/db-log.fifo &
exec >/tmp/db-log.fifo 2>&1
echo "flowdeck: database container starting $(date -Iseconds)"

# The password is generated once. If its file is lost while the data exists, a new one is generated and set
# on the role below, instead of leaving the app locked out.
pw=/state/secrets/postgres-password
if [ ! -s "$pw" ]; then
  if [ -s /state/postgres/PG_VERSION ]; then
    echo "flowdeck: $pw is missing but the database exists; generating a new password (data is kept)"
  fi
  (umask 077 && head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' >"$pw")
fi
chown 1000:1000 "$pw"
chmod 700 /state/secrets && chmod 600 "$pw"
install -m 600 -o postgres "$pw" /run/pg-password

# Once the real server listens on TCP (not the temporary socket-only server of the first initialisation),
# check that the password file works and that the database exists. Both are no-ops on a healthy install.
(
  up=""
  for _ in $(seq 1 600); do
    if pg_isready -q -h 127.0.0.1 -U flowdeck -d postgres; then up=1; break; fi
    sleep 1
  done
  [ -n "$up" ] || exit 0
  # Test the password the way the dev container connects: over the network address, because loopback
  # connections are trusted by pg_hba.conf and would accept any password.
  addr="$(hostname -i | awk '{print $1}')"
  if ! PGPASSFILE=/dev/null PGPASSWORD="$(cat /run/pg-password)" psql -h "$addr" -U flowdeck -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    echo "flowdeck: the role password did not match $pw; setting it from the file (data is kept)"
    # Keep the statement (and so the password) out of the server log even if it fails.
    printf '%s\n' "SET log_min_error_statement = 'panic';" '\set pw `cat /run/pg-password`' "ALTER ROLE flowdeck PASSWORD :'pw';" |
      psql -q -v ON_ERROR_STOP=1 -h /var/run/postgresql -U flowdeck -d postgres || true
  fi
  if [ "$(psql -tA -h /var/run/postgresql -U flowdeck -d postgres -c "select 1 from pg_database where datname = 'flowdeck'" 2>/dev/null)" != "1" ]; then
    echo "flowdeck: database 'flowdeck' is missing (interrupted first start?); creating it"
    createdb -h /var/run/postgresql -U flowdeck -O flowdeck flowdeck || true
  fi
) &

exec docker-entrypoint.sh postgres
