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
