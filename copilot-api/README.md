# copilot-api

> For build instructions and source code, see the [GitHub repository](https://github.com/Lumysia/charts/tree/main/copilot-api).

## Usage

- [copilot-api README](https://github.com/ericc-ch/copilot-api)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GH_TOKEN` | GitHub personal access token with Copilot access |

## Ports

| Port | Description |
|------|-------------|
| `4141` | HTTP API server (OpenAI/Anthropic compatible) |

## Quick Start

```sh
docker run -e GH_TOKEN=your_token ghcr.io/lumysia/copilot-api:alpine-nightly
```

To authenticate interactively (if no `GH_TOKEN`):

```sh
docker run -it ghcr.io/lumysia/copilot-api:alpine-nightly --auth
```
