#!/bin/sh
set -e

DATA_PATH="${DATA_DIR:-/app/data}"

mkdir -p "$DATA_PATH"
chown -R nextjs:nodejs "$DATA_PATH"

exec su-exec nextjs:nodejs "$@"
