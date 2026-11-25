# Mirrors upstream backend/Dockerfile, fetching the source at build time.

ARG ALACARTE_REPO=https://github.com/norifm/alacarte.git
ARG ALACARTE_REF=main

FROM alpine:3.22 AS src
ARG ALACARTE_REPO ALACARTE_REF
RUN apk add --no-cache git \
    && git clone --single-branch "${ALACARTE_REPO}" /src \
    && git -C /src checkout "${ALACARTE_REF}" \
    && git -C /src rev-parse HEAD

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY --from=src /src/frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY --from=src /src/frontend ./
RUN npm run build

FROM node:22-bookworm-slim AS node-build
WORKDIR /app
COPY --from=src /src/backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=src /src/backend/server.mjs ./
COPY --from=src /src/backend/routes ./routes
COPY --from=src /src/backend/lib ./lib
COPY --from=src /src/backend/scripts ./scripts
COPY --from=frontend-build /app/backend/public ./public

FROM node:22-bookworm-slim AS node-runtime

# Pinned: upstream :latest once drifted to a musl-linked binary that fails
# execve on this glibc base. musl is installed as a fallback loader.
FROM ghcr.io/zhaarey/apple-music-downloader@sha256:e9364425b5034bdb55414672992bd369b65c9542832eac6de97b9d6994feecf3

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      musl \
      tini \
      curl \
      && rm -rf /var/lib/apt/lists/*

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /app
COPY --from=node-build /app /app

RUN MP4Box -version 2>&1 | grep -q 'GPAC version' || (echo 'MP4Box runtime check failed' && exit 1)
RUN command -v apple-music-dl >/dev/null
RUN rc=0; apple-music-dl --help >/dev/null 2>&1 || rc=$?; if [ "$rc" = "127" ]; then echo 'apple-music-dl cannot be executed (wrong libc / missing loader)' >&2; exit 1; fi

EXPOSE 7373
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server.mjs"]
