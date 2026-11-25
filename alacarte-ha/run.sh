#!/bin/sh
# Start the FairPlay wrapper supervisor, then the ALACarte web app.
#
# /data is the add-on's persistent data dir: the Apple session (wrapper
# rootfs data), the supervisor control token, and ALACarte settings all
# survive add-on updates. Downloads go to the mapped media library.
set -eu

MUSIC_DIR="${MUSIC_PATH:-/media/music}"

# Persist the Apple session inside the add-on data dir.
mkdir -p /data/wrapper /data/supervisor /app/rootfs/data /app/rootfs/dev /app/rootfs/etc
grep -q ' /app/rootfs/data ' /proc/mounts || mount --bind /data/wrapper /app/rootfs/data

# Device nodes required by the Android chroot.
[ -e /app/rootfs/dev/null ]    || mknod /app/rootfs/dev/null    c 1 3
[ -e /app/rootfs/dev/urandom ] || mknod /app/rootfs/dev/urandom c 1 9
[ -e /app/rootfs/dev/random ]  || mknod /app/rootfs/dev/random  c 1 8
[ -e /app/rootfs/dev/zero ]    || mknod /app/rootfs/dev/zero    c 1 5

# Keep the chroot resolver in sync (same as the upstream wrapper entrypoint).
cp /etc/resolv.conf /app/rootfs/etc/resolv.conf

export SUPERVISOR_TOKEN_FILE=/data/supervisor/token
export LD_PRELOAD=/app/libwrapper_login_fix.so
/app/supervisor -H 0.0.0.0 &

export PORT=7373
export AMDL_WRAPPER_HOST=127.0.0.1
export AMDL_WRAPPER_DECRYPT_PORT=10020
export AMDL_WRAPPER_M3U8_PORT=20020
export AMDL_WRAPPER_ACCOUNT_PORT=30020
export AMDL_WRAPPER_SUPERVISOR_PORT=40020
export AMDL_SUPERVISOR_TOKEN_FILE=/data/supervisor/token
export AMDL_MUSIC_PATH="$MUSIC_DIR"
export AMDL_CONFIG_DIR=/data

cd /app
exec node server.mjs
