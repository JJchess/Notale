FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NOTALE_BROWSER_PATH=/usr/bin/chromium

WORKDIR /app
COPY . /app/notale
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs chromium fonts-liberation fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir /app/notale \
    && useradd --create-home --uid 10001 notale \
    && chown -R notale:notale /app/notale

USER notale
WORKDIR /app/notale
EXPOSE 3002
ENTRYPOINT ["/app/notale/docker/entrypoint.sh"]
CMD ["--help"]
