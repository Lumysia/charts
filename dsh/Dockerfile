# DeepSeek Harness (dsh web) on trycua's Linux desktop image.
#
# The base (full tier) already ships Node 24 LTS (replaced with a newer 24.x
# below), npm and a pnpm wrapper, which is everything DSH needs: Node >= 24.9
# to run, pnpm on PATH for `dsh plugin`.
# DSH runs as one more supervisord program next to the base's own (desktop,
# audio, cua-spacesd), added through conf.d the way upstream's bench/web image
# does it.

ARG BASE_IMAGE=ghcr.io/trycua/linux:24.04

FROM ${BASE_IMAGE}

# The base pins Node 24.21.0, which predates the 24.22.1 security release
# (zlib/Brotli fix, on CISA KEV). Replace it with a newer 24.x until the base
# moves past it; drop this block then.
ARG NODE_VERSION=24.22.2
ARG NODE_SHA256_AMD64=48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75
ARG NODE_SHA256_ARM64=eb187837a2230d4047161ac0be008584e16b46f726e9c9490ee35dc6b17d9ba8
ARG TARGETARCH
RUN set -eu; \
    case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
      amd64) arch=x64; sha="$NODE_SHA256_AMD64" ;; \
      arm64) arch=arm64; sha="$NODE_SHA256_ARM64" ;; \
      *) echo "unsupported arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz"; \
    echo "${sha}  /tmp/node.tar.xz" | sha256sum -c -; \
    rm -rf /usr/local/lib/nodejs && mkdir -p /usr/local/lib/nodejs; \
    tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs --strip-components=1; \
    rm -f /tmp/node.tar.xz; \
    test "$(node --version)" = "v${NODE_VERSION}"

# npm dist-tag or exact version. The default follows upstream's `latest` tag;
# scheduled rebuilds run without cache, so each rebuild installs the newest one.
ARG DSH_VERSION=latest

RUN npm install --global --no-audit --no-fund "@deepseek-ai/dsh@${DSH_VERSION}" \
 && ln -sf "$(npm prefix --global)/bin/dsh" /usr/local/bin/dsh \
 && npm cache clean --force \
 && dsh --version | tee /etc/cua-image/dsh-version

# ssh and ssh-keygen: git signs commits with an SSH key (gpg.format=ssh), which
# fails with "cannot run ssh-keygen" without them, and some remotes use ssh.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client \
 && rm -rf /var/lib/apt/lists/*

COPY files/start-dsh.sh /opt/dsh/start-dsh.sh
COPY files/seed-home.sh /opt/cua/entrypoint.d/50-dsh-home.sh
COPY files/dsh.healthcheck.sh /opt/cua/healthcheck.d/20-dsh.sh
COPY files/supervisor/dsh.conf /etc/supervisor/conf.d/dsh.conf

# Keep a copy of the desktop user's home: a bind mount over /home/cua starts
# empty, and the entrypoint hook seeds it from here without overwriting.
RUN chmod 0755 /opt/dsh/start-dsh.sh \
 && cp -a /home/cua /opt/dsh/home-skel \
 && printf '\n[include]\nfiles = /etc/supervisor/conf.d/*.conf\n' >>/etc/supervisor/supervisord.conf

ENV DSH_HOME=/home/cua/.dsh DSH_PORT=3080

# 3080 dsh web (plus the base ports: 3211 spacesd, 3212/udp media, 18080 fixture).
EXPOSE 3080
