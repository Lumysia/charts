#!/bin/sh
# Start Music Assistant with extra providers.
#
# /config is this app's public config folder (on the host:
# /addon_configs/<repository hash>_music_assistant_custom). Every folder in
# /config/providers/<domain>/ is linked into music_assistant/providers/<domain>
# before the server starts. A folder with the same name as a built-in provider
# replaces it.
#
# One-time migration: if /data has no settings yet and
# /share/ma-migrate/data exists, its contents are copied into /data first.
set -eu

PROVIDERS_SRC=/config/providers
MIGRATE_SRC=/share/ma-migrate/data

mkdir -p "$PROVIDERS_SRC"

if [ ! -f /data/settings.json ] && [ -d "$MIGRATE_SRC" ]; then
    echo "[ma-custom] Migrating data from $MIGRATE_SRC"
    cp -a "$MIGRATE_SRC"/. /data/
fi

PROVIDERS_DST="$("$VIRTUAL_ENV/bin/python" -c \
    'import sysconfig; print(sysconfig.get_path("purelib"))')/music_assistant/providers"

for src in "$PROVIDERS_SRC"/*/; do
    [ -d "$src" ] || continue
    name="$(basename "$src")"
    if [ ! -f "$src/manifest.json" ]; then
        echo "[ma-custom] Skipping $name: no manifest.json"
        continue
    fi
    dst="$PROVIDERS_DST/$name"
    if [ -e "$dst" ] && [ ! -L "$dst" ]; then
        echo "[ma-custom] $name replaces the built-in provider"
        rm -rf "$dst"
    fi
    ln -sfn "${src%/}" "$dst"
    echo "[ma-custom] Linked provider $name"
done

# Same arguments as the official image's ENTRYPOINT (they are not passed in as CMD).
exec /usr/local/bin/entrypoint.sh --data-dir /data --cache-dir /data/.cache "$@"
