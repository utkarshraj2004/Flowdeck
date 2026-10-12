#!/usr/bin/env bash
# Prepare a development environment (used by the Claude Code SessionStart hook; safe to re-run).
# Installs npm dependencies and, if a local PostgreSQL 16 is installed but not running, starts it and
# creates the development role/database used by the default DATABASE_URL and the tests.
set -u
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund >/dev/null 2>&1 || echo "dev-setup: npm ci failed (run it manually to see why)"
if command -v pg_lsclusters >/dev/null 2>&1; then
  if ! pg_isready -q 2>/dev/null; then
    (service postgresql start || pg_ctlcluster 16 main start) >/dev/null 2>&1 || true
    sleep 2
  fi
  if pg_isready -q 2>/dev/null && command -v su >/dev/null 2>&1; then
    su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='flowdeck'\"" 2>/dev/null | grep -q 1 ||
      su postgres -c "psql -c \"CREATE ROLE flowdeck LOGIN PASSWORD 'flowdeck' CREATEDB\"" >/dev/null 2>&1
    su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='flowdeck'\"" 2>/dev/null | grep -q 1 ||
      su postgres -c "createdb -O flowdeck flowdeck" >/dev/null 2>&1
  fi
fi
exit 0
