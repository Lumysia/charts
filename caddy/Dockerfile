ARG CADDY_BASE_IMAGE=alpine
ARG CADDY_MODULES=""

FROM caddy:builder-${CADDY_BASE_IMAGE} AS builder

ARG CADDY_MODULES

RUN set -eux; \
    if [ -n "$CADDY_MODULES" ]; then \
        xcaddy build $(echo "$CADDY_MODULES" | xargs -n1 echo --with | xargs); \
    else \
        xcaddy build; \
    fi

FROM caddy:${CADDY_BASE_IMAGE}

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
