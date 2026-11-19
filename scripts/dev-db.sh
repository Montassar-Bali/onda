#!/usr/bin/env bash
# Starts a project-local PostgreSQL cluster on port 5433 (trust auth, localhost only).
# Data lives in ./.pgdata (git-ignored). For development/testing only.
set -euo pipefail
export LC_ALL=C LANG=C
cd "$(dirname "$0")/.."
PGDATA=".pgdata"
PORT="${PGPORT_DEV:-5433}"
if [ ! -d "$PGDATA" ]; then
  initdb -D "$PGDATA" -U tropical --auth=trust -E UTF8 --locale=C >/dev/null
  echo "listen_addresses = 'localhost'" >> "$PGDATA/postgresql.conf"
  echo "port = $PORT" >> "$PGDATA/postgresql.conf"
  echo "unix_socket_directories = ''" >> "$PGDATA/postgresql.conf"
fi
if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" -w start >/dev/null
fi
for db in tropical tropical_test; do
  psql -h localhost -p "$PORT" -U tropical -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || psql -h localhost -p "$PORT" -U tropical -d postgres -c "CREATE DATABASE $db" >/dev/null
done
echo "PostgreSQL running on localhost:$PORT (databases: tropical, tropical_test)"
