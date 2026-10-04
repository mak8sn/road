#!/bin/sh
set -eu

backup() {
  pg_dump -Fc -f /backup/road.dump.tmp
  mv /backup/road.dump.tmp /backup/road.dump
}

trap 'backup; exit 0' TERM

while true; do
  backup
  sleep 30
done
