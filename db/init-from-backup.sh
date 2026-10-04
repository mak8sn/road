#!/bin/sh
set -eu

if [ -s /backup/road.dump ]; then
  restore_file=/backup/road.dump
elif [ -s /backup/road-pre-compose.dump ]; then
  restore_file=/backup/road-pre-compose.dump
fi

if [ -n "${restore_file:-}" ]; then
  pg_restore --exit-on-error --no-owner --no-privileges \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$restore_file"
fi
