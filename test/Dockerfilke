FROM alpine:latest

ARG APP_VERSION="unknown"
ARG MAINTAINER_NAME="default_user"

LABEL version="${APP_VERSION}"
LABEL maintainer="${MAINTAINER_NAME}"

CMD echo "--- Test Container ---" && \
    echo "App Version: ${APP_VERSION}" && \
    echo "Maintained by: ${MAINTAINER_NAME}" && \
    echo "----------------------"
