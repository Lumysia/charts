# DeepSeek Harness (dsh web) on trycua's Linux desktop image.
#
# The base (full tier) already ships Node 24 LTS, npm and a pnpm wrapper, which
# is everything DSH needs: Node >= 24.9 to run, pnpm on PATH for `dsh plugin`.
# DSH runs as one more supervisord program next to the base's own (desktop,
# audio, cua-spacesd), added through conf.d the way upstream's bench/web image
# does it.

ARG BASE_IMAGE=ghcr.io/trycua/linux:24.04

FROM ${BASE_IMAGE}

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

# The base's Chromium (xtradeb PPA) trails Chrome stable by weeks, which leaves
# exploited bugs open. On amd64, run Chrome for Testing instead: its binary
# replaces /usr/lib/chromium/chromium (diverted, so apt keeps the package and
# its dependencies), so /usr/bin/chromium, its /etc/chromium.d flags (the
# sandbox choice included) and every launcher of the base keep working.
# CHROME_VERSION is a channel (Stable, Beta...) or an exact version; scheduled
# rebuilds run without cache, so a channel follows its newest release. Chrome
# for Testing has no Linux arm64 build, so arm64 keeps the base's Chromium.
ARG CHROME_VERSION=Stable
ARG TARGETARCH
RUN set -eu; \
    if [ "${TARGETARCH:-$(dpkg --print-architecture)}" != amd64 ]; then exit 0; fi; \
    cft=https://googlechromelabs.github.io/chrome-for-testing; \
    case "$CHROME_VERSION" in \
      [0-9]*) version="$CHROME_VERSION" ;; \
      *) version="$(curl -fsSL "$cft/last-known-good-versions.json" | jq -er --arg c "$CHROME_VERSION" '.channels[$c].version')" ;; \
    esac; \
    url="https://storage.googleapis.com/chrome-for-testing-public/${version}/linux64/chrome-linux64.zip"; \
    md5="$(curl -fsSI "$url" | tr -d '\r' | sed -n 's/^x-goog-hash: md5=//Ip')"; \
    test -n "$md5"; \
    curl -fsSL -o /tmp/chrome.zip "$url"; \
    echo "$(echo "$md5" | base64 -d | od -An -tx1 | tr -d ' \n')  /tmp/chrome.zip" | md5sum -c -; \
    rm -rf /opt/chrome-for-testing && mkdir -p /opt/chrome-for-testing; \
    unzip -q /tmp/chrome.zip -d /opt/chrome-for-testing; \
    rm -f /tmp/chrome.zip; \
    dpkg-divert --quiet --local --rename --divert /usr/lib/chromium/chromium.xtradeb --add /usr/lib/chromium/chromium; \
    ln -s /opt/chrome-for-testing/chrome-linux64/chrome /usr/lib/chromium/chromium; \
    /usr/lib/chromium/chromium --version | tee /etc/cua-image/chromium-version; \
    /usr/lib/chromium/chromium --version | grep -qF "$version"

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
