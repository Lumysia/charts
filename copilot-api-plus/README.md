# copilot-api-plus

> For build instructions and source code, see the [GitHub repository](https://github.com/Lumysia/charts/tree/main/copilot-api-plus).

## Usage

- [copilot-api-plus README](https://github.com/Lumysia/copilot-api-plus)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GH_TOKEN` | GitHub personal access token with Copilot access |

- `GH_TOKEN` is the upstream GitHub token used by the service itself.

- `API_KEY` / `COPILOT_API_KEY` are optional downstream auth keys for clients calling this API. They are not required unless you want to protect the exposed endpoint.

## Ports

| Port | Description |
|------|-------------|
| `4141` | HTTP API server (OpenAI/Anthropic compatible) |
