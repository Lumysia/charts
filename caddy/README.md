# Caddy

> For build instructions and source code, see the [GitHub repository](https://github.com/Lumysia/charts/tree/main/caddy).

## Usage

- [Official Caddy Documentation](https://caddyserver.com/docs/)
- [Caddy-Docker-Proxy README](https://github.com/lucaslorentz/caddy-docker-proxy)

## Additional Modules

This image includes the following Caddy modules:

### alpine tag

- `github.com/caddy-dns/acmedns` - ACME DNS challenge support
- `github.com/mholt/caddy-l4` - Layer 4 (non-HTTP) proxy capabilities
- `github.com/caddy-dns/cloudflare` - Cloudflare DNS provider
- `github.com/greenpau/caddy-security` - Enhanced security features

### alpine-docker tag

Includes all modules from the Alpine variant, plus:

- `github.com/lucaslorentz/caddy-docker-proxy/v2` - Dynamic configuration from Docker labels
