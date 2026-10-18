# alacarte-wrapper

> For build instructions and source code, see the [GitHub repository](https://github.com/Lumysia/charts/tree/main/alacarte-wrapper).

FairPlay decryption daemon + login supervisor bundled by
[norifm/alacarte](https://github.com/norifm/alacarte) (its `wrapper/` directory:
prebuilt x86_64 wrapper binary from [WorldObservationLog/wrapper](https://github.com/WorldObservationLog/wrapper),
bundled Android rootfs, login-fix preloads, and the Go supervisor that serves the
sign-in control API). Built from the alacarte source at build time
(`ALACARTE_REF` in `wrapper.env` selects branch, tag, or commit).

**amd64 only** — the bundled wrapper binary and rootfs libraries are x86_64.

Pair with the [alacarte (web)](../alacarte/) image; see its README for the compose
example. The two containers share a `supervisor` token directory and one Docker network.

## Ports

| Port | Description |
|------|-------------|
| `10020` | Sample decryption service (binary protocol) |
| `20020` | M3U8 stream URL service |
| `30020` | Account (storefront) info |
| `40020` | Login supervisor control API (internal only) |

## Volumes

| Path | Description |
|------|-------------|
| `/app/rootfs/data` | Apple session + key cache (sign in once) |
| `/app/supervisor-secret` | Supervisor token shared with the web container |

## Tags

- `wrapper-nightly` — built from the current `ALACARTE_REF` (default: upstream main)

alacarte is licensed AGPL-3.0; its source remains available from the upstream repository linked above.
