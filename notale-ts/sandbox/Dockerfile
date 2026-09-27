# The AI agent's shell. Runs as the host user (docker run --user), sees only /workspace, and
# reaches the network only through the allowlist proxy on the internal network.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 curl git ca-certificates procps ripgrep ffmpeg poppler-utils \
 && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp NPM_CONFIG_CACHE=/tmp/.npm NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /workspace
CMD ["sleep", "infinity"]
