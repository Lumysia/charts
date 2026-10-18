# Single-container HA add-on: ALACarte web + FairPlay wrapper + supervisor
# in one image. Mirrors the upstream backend/ and wrapper/ Dockerfiles,
# fetching the source at build time. amd64 only (wrapper binary + amdp base).

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

FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS supervisor-builder
WORKDIR /src
COPY --from=src /src/wrapper/supervisor/ ./
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -ldflags="-s -w" -o /supervisor .

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
      gcc \
      libc6-dev \
      && rm -rf /var/lib/apt/lists/*

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules

# Wrapper: rootfs, binary, preloads, supervisor
COPY --from=src /src/wrapper/rootfs /app/rootfs
COPY --from=src /src/wrapper/wrapper /app/wrapper
COPY --from=src /src/wrapper/preload_host.c /src/wrapper/preload_libdl_stub.c /src/wrapper/wrapper_login_fix.c /app/
COPY --from=supervisor-builder /supervisor /app/supervisor
WORKDIR /app
RUN gcc -shared -fPIC -O2 \
      -Wl,-soname,libwrapper_login_fix.so \
      -o /app/libwrapper_login_fix.so /app/preload_host.c \
  && mkdir -p /app/rootfs/app \
  && gcc -shared -fPIC -nostdlib -Wl,--hash-style=sysv \
      -Wl,-soname,libdl.so -o /tmp/libdl.so /app/preload_libdl_stub.c \
  && gcc -shared -fPIC -O2 -nostdlib -fno-stack-protector -fno-builtin \
      -fno-asynchronous-unwind-tables -Wl,--hash-style=sysv \
      -Wl,-soname,libwrapper_login_fix.so \
      -L/app/rootfs/system/lib64 -L/tmp \
      -o /app/rootfs/app/libwrapper_login_fix.so /app/wrapper_login_fix.c \
      -Wl,--no-as-needed -lc -ldl \
  && chmod +x /app/supervisor

# App (merges into /app alongside the wrapper files)
COPY --from=node-build /app /app
WORKDIR /app

# Build-time sanity checks
RUN MP4Box -version 2>&1 | grep -q 'GPAC version' || (echo 'MP4Box runtime check failed' && exit 1)
RUN command -v apple-music-dl >/dev/null
RUN rc=0; apple-music-dl --help >/dev/null 2>&1 || rc=$?; if [ "$rc" = "127" ]; then echo 'apple-music-dl cannot be executed (wrong libc / missing loader)' >&2; exit 1; fi
RUN node --check server.mjs

COPY run.sh /app/run.sh
RUN chmod +x /app/run.sh

EXPOSE 7373
ENTRYPOINT ["/usr/bin/tini","--","/app/run.sh"]
