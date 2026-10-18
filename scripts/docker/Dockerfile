FROM docker:28.5.1-cli AS docker-cli
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/notale/browsers
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git python3 procps ripgrep ffmpeg poppler-utils \
    libreoffice-writer libreoffice-impress fontconfig fonts-noto-cjk fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
WORKDIR /app

# Package manifests are separate layers; source edits reuse locked dependency installs.
COPY notale-format/package.json notale-format/package-lock.json ./notale-format/
RUN npm ci --prefix notale-format && npm cache clean --force
COPY notale-format/ ./notale-format/
RUN npm run build --prefix notale-format
COPY notale-editor/package.json notale-editor/package-lock.json ./notale-editor/
RUN npm ci --prefix notale-editor && npm cache clean --force
COPY notale-ts/package.json notale-ts/package-lock.json ./notale-ts/
RUN npm ci --prefix notale-ts && npm cache clean --force
COPY notale-editor-frontend/package.json notale-editor-frontend/package-lock.json ./notale-editor-frontend/
COPY notale-editor-frontend/vendor/ ./notale-editor-frontend/vendor/
RUN npm ci --prefix notale-editor-frontend && npm cache clean --force
COPY notale-viewer/package.json notale-viewer/package-lock.json ./notale-viewer/
RUN npm ci --prefix notale-viewer && npm cache clean --force

COPY notale-editor/ ./notale-editor/
COPY notale-ts/ ./notale-ts/
COPY notale-editor-frontend/ ./notale-editor-frontend/
COPY notale-viewer/ ./notale-viewer/

RUN cd /app/notale-ts && ./node_modules/.bin/playwright install --with-deps chromium \
    && node --input-type=module -e "import {chromium} from 'playwright'; import {symlinkSync} from 'node:fs'; symlinkSync(chromium.executablePath(), '/opt/notale/chromium');" \
    && rm -rf /var/lib/apt/lists/*
RUN npm run build --prefix notale-editor \
    && npm run build --prefix notale-ts \
    && npm run build --prefix notale-editor-frontend \
    && NOTALE_API_URL=http://generator:4321 npm run build --prefix notale-viewer

# Do not replace editor-frontend/.local: it contains the compiled HTTP server.
# Source and node_modules remain root-owned. Only Next runtime caches and its
# generated config need image-local writes; authored files live in /data.
RUN rm -rf /app/notale-editor/.local /app/notale-viewer/.local /app/notale-ts/.cache \
      /app/notale-editor-frontend/.next/cache /app/notale-viewer/.next/cache \
    && ln -s /data/editor /app/notale-editor/.local \
    && ln -s /data/viewer /app/notale-viewer/.local \
    && ln -s /data/generator/cache /app/notale-ts/.cache \
    && mkdir -p /app/notale-editor-frontend/.next/cache /app/notale-viewer/.next/cache \
    && chown node:node /app/notale-editor-frontend/.next /app/notale-viewer/.next \
      /app/notale-editor-frontend/.next/cache /app/notale-viewer/.next/cache \
      /app/notale-editor-frontend/.next-typecheck-*.json \
    && find /app/notale-editor-frontend/.next /app/notale-viewer/.next -maxdepth 1 \
      -type f -name 'trace*' -exec chown node:node '{}' +
COPY --chown=node:node scripts/docker/ ./scripts/docker/
COPY --chown=node:node LICENSE ./LICENSE
USER node
