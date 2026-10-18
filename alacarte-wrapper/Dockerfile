# Mirrors upstream wrapper/Dockerfile, fetching the source at build time.
# amd64 only: bundled wrapper binary and rootfs libraries are x86_64.

ARG ALACARTE_REPO=https://github.com/norifm/alacarte.git
ARG ALACARTE_REF=main

FROM alpine:3.22 AS src
ARG ALACARTE_REPO ALACARTE_REF
RUN apk add --no-cache git \
    && git clone --single-branch "${ALACARTE_REPO}" /src \
    && git -C /src checkout "${ALACARTE_REF}" \
    && git -C /src rev-parse HEAD

FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS supervisor-builder
WORKDIR /src
COPY --from=src /src/wrapper/supervisor/ ./
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -ldflags="-s -w" -o /supervisor .

FROM debian:stable-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*

COPY --from=src /src/wrapper/rootfs /app/rootfs
COPY --from=src /src/wrapper/wrapper /app/wrapper
COPY --from=src /src/wrapper/preload_host.c /src/wrapper/preload_libdl_stub.c /src/wrapper/wrapper_login_fix.c /src/wrapper/wrapper-entrypoint.sh /app/
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
  && chmod +x /app/wrapper-entrypoint.sh /app/supervisor

ENTRYPOINT ["/app/wrapper-entrypoint.sh"]
CMD ["-H", "0.0.0.0"]

EXPOSE 10020 20020 30020 40020
