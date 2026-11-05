#!/usr/bin/env bash
# Start `dsh web` as the desktop user (supervisord program `dsh`).
#
# DSH rejects wildcard bind addresses, so the listener binds one concrete
# address: DSH_LISTEN_HOST, else the container's first address, which a
# reverse proxy on the same Docker network can reach. Set DSH_LISTEN_HOST=127.0.0.1
# to keep it loopback-only.
set -euo pipefail

host="${DSH_LISTEN_HOST:-$(hostname -i | awk '{print $1}')}"
args=(--profile "${DSH_PROFILE:-web}" --no-open --host "$host" --port "${DSH_PORT:-3080}")
[ -n "${DSH_PUBLIC_URL:-}" ] && args+=(--public-url "$DSH_PUBLIC_URL")
for authority in ${DSH_TRUSTED_HOSTS:-}; do
    args+=(--trusted-host "$authority")
done

cd "$HOME"
exec dsh "${args[@]}"
