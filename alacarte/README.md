# alacarte (web)

> For build instructions and source code, see the [GitHub repository](https://github.com/Lumysia/charts/tree/main/alacarte).

Self-hosted Apple Music downloader UI (search, queue, library, followed artists/playlists).
Built from the [norifm/alacarte](https://github.com/norifm/alacarte) source at build time
(`ALACARTE_REF` in `web.env` selects branch, tag, or commit). Upstream publishes no
container images, so this image replaces the `build:` section of the upstream compose.

The web image drives the [alacarte-wrapper](../alacarte-wrapper/) image for FairPlay
decryption and Apple sign-in; both must be on the same Docker network, and both are
**amd64 only** (the upstream downloader base image and wrapper binary are x86_64).

## Usage

- [alacarte README](https://github.com/norifm/alacarte)

## Ports

| Port | Description |
|------|-------------|
| `7373` | Web UI + API |

## Volumes

| Path | Description |
|------|-------------|
| `/music` | Music library output (set host dir via `MUSIC_PATH`) |
| `/config` | Settings, auth, download state |
| `/supervisor-secret` | Read-only supervisor token shared with the wrapper container |

## Running with the wrapper image

Compose equivalent of the upstream stack using these images:

```yaml
services:
  wrapper:
    image: ghcr.io/lumysia/alacarte-wrapper:wrapper-nightly
    platform: linux/amd64
    volumes:
      - ./data/wrapper:/app/rootfs/data
      - ./data/supervisor:/app/supervisor-secret
      - /dev/null:/app/rootfs/dev/null
      - /dev/urandom:/app/rootfs/dev/urandom
      - /dev/random:/app/rootfs/dev/random
      - /dev/zero:/app/rootfs/dev/zero
    environment:
      - LD_PRELOAD=/app/libwrapper_login_fix.so
      - SUPERVISOR_TOKEN_FILE=/app/supervisor-secret/token
    expose:
      - "10020"
      - "20020"
      - "30020"
      - "40020"
    networks:
      - alacarte-net
    restart: on-failure

  web:
    image: ghcr.io/lumysia/alacarte:web-nightly
    platform: linux/amd64
    depends_on:
      - wrapper
    environment:
      - PORT=7373
      - AMDL_WRAPPER_HOST=wrapper
      - AMDL_WRAPPER_DECRYPT_PORT=10020
      - AMDL_WRAPPER_M3U8_PORT=20020
      - AMDL_WRAPPER_ACCOUNT_PORT=30020
      - AMDL_WRAPPER_SUPERVISOR_PORT=40020
      - AMDL_SUPERVISOR_TOKEN_FILE=/supervisor-secret/token
      - AMDL_MUSIC_PATH=/music
      - AMDL_CONFIG_DIR=/config
    volumes:
      - ./data/web:/config
      - ./data/supervisor:/supervisor-secret:ro
      - ${MUSIC_PATH:?Set MUSIC_PATH in .env}:/music
    ports:
      - "7373:7373"
    networks:
      - alacarte-net
    restart: unless-stopped

networks:
  alacarte-net:
```

First-time Apple sign-in (with 2FA) is done in the web UI under Settings; the session
persists in the `./data/wrapper` volume.

## Tags

- `web-nightly` — built from the current `ALACARTE_REF` (default: upstream main)

alacarte is licensed AGPL-3.0; its source remains available from the upstream repository linked above.
