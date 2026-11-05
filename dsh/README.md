# dsh (web)

> For build instructions and source code, see the [GitHub repository](https://github.com/Lumysia/charts/tree/main/dsh).

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh web`) on
[trycua's Linux desktop image](https://github.com/trycua/cua/tree/main/libs/images/linux)
(`ghcr.io/trycua/linux:24.04`: Ubuntu 24.04, XFCE on Xvfb, Chromium and Firefox, cua-spacesd
with its HTML5 viewer, Node 24 and pnpm). The agent gets a real Linux desktop to work in.

DSH is added as one more supervisord program (`dsh`, user `cua`) next to the base image's
own services, which keep working unchanged. Only DSH itself is baked in; plugins are
installed at runtime into `DSH_HOME` and persist with it.

DSH is a developer preview: expect breaking changes between releases.

## Ports

| Port | Description |
|------|-------------|
| `3080` | `dsh web` (browser UI and API) |
| `3211` | cua-spacesd: gRPC and the desktop viewer at `/viewer/` (needs `CUA_ENV_TOKEN`) |
| `3212/udp` | cua-spacesd media |

## Volumes

| Path | Description |
|------|-------------|
| `/home/cua` | Desktop user's home, including `DSH_HOME` (`/home/cua/.dsh`: profiles, plugins, sessions, credentials). An empty mount is seeded with the image's desktop profile at start. |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DSH_PUBLIC_URL` | unset | Public HTTPS root browsers use (`--public-url`) |
| `DSH_TRUSTED_HOSTS` | unset | Space-separated authorities the Host fence accepts (`--trusted-host`); needed for any public hostname |
| `DSH_LISTEN_HOST` | container's first IP | Bind address; DSH rejects wildcards. `127.0.0.1` keeps it loopback-only |
| `DSH_PORT` | `3080` | Listen port |
| `DSH_PROFILE` | `web` | DSH profile to boot |
| `DEEPSEEK_API_KEY` | unset | Model key DSH reads for its default DeepSeek provider |
| `CUA_ENV_TOKEN` | random | cua-spacesd token (base image) |

Run with at least `--shm-size=512m` (upstream's own run command; Chromium needs it).

## Login

`dsh web` prints a one-time launch URL (`dsh web: <url>?token=...`) to
`/var/log/supervisor/dsh.log` on each start; opening it sets a signed cookie that lasts 30
days and survives restarts on the same hostname. Put the port behind a TLS reverse proxy that
keeps the browser's `Host` and forwards WebSocket upgrades.

## Plugins

Install into the running profile; they land in `/home/cua/.dsh/profiles/web` and persist:

```sh
docker exec -u cua <container> dsh plugin --profile web add <package>
```

Profile config overrides go in `/home/cua/.dsh/profiles/web/cordis.patch.yml`.

## Tags

- `web-nightly`: newest `@deepseek-ai/dsh` (`latest` npm tag) on the current `ghcr.io/trycua/linux:24.04`.
  Rebuilt when the base image changes and at least weekly; the installed version is in
  `/etc/cua-image/dsh-version`.

DeepSeek Harness is MIT licensed; see the upstream repositories for the base image's licences.
