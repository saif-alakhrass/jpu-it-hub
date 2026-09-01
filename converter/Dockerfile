FROM node:22-bookworm-slim

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-impress \
    fonts-dejavu-core \
    fonts-noto-core \
    fonts-noto-extra \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --create-home --home-dir /home/converter converter

WORKDIR /app
COPY --chown=converter:converter server.mjs /app/server.mjs

USER converter
ENV NODE_ENV=production \
    HOME=/home/converter \
    TMPDIR=/tmp

EXPOSE 8080
CMD ["node", "/app/server.mjs"]
