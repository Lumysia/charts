# Official Music Assistant server image plus a start script that links
# third-party providers from /config/providers into the installed package.
ARG MA_VERSION=2.10.7
FROM ghcr.io/music-assistant/server:${MA_VERSION}

COPY run.sh /usr/local/bin/ma-custom-run.sh
RUN chmod 755 /usr/local/bin/ma-custom-run.sh

ENTRYPOINT ["/usr/local/bin/ma-custom-run.sh"]
