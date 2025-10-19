# NaiveProxy

> For build instructions and source code, see the [GitHub repository](https://github.com/Lumysia/charts/tree/main/naiveproxy).

## Usage

- [NaiveProxy README](https://github.com/klzgrad/naiveproxy)
- [Official Caddy Documentation](https://caddyserver.com/docs/)
- [Caddy-Docker-Proxy README](https://github.com/lucaslorentz/caddy-docker-proxy)

## Additional Modules

This image includes the following Caddy modules:

### alpine tag

- `github.com/caddyserver/forwardproxy=github.com/klzgrad/forwardproxy@naive` - NaïveProxy uses Chromium's network stack to camouflage traffic with strong censorship resistance and low detectability.

### alpine-docker tag

Includes all modules from the Alpine variant, plus:

- `github.com/lucaslorentz/caddy-docker-proxy/v2` - Dynamic configuration from Docker labels
