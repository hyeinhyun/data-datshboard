# syntax=docker/dockerfile:1.7
# One image: Next.js standalone server + the Python HF worker (uv-managed venv).
# Debian bookworm ships Python 3.11, which the worker requires, so every stage
# uses the same base and the venv built in `worker` runs unchanged in `runner`.

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- 1. node dependencies ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. next build ----------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- 3. python worker venv ----------
FROM ${NODE_IMAGE} AS worker
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app/workers
COPY workers/pyproject.toml workers/uv.lock ./
RUN uv sync --no-dev --no-install-project --python /usr/bin/python3
COPY workers/ ./
RUN uv sync --no-dev --python /usr/bin/python3

# ---------- 4. runtime ----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    PYTHON_BIN=/app/workers/.venv/bin/python \
    WORKERS_DIR=/app/workers
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && addgroup --system --gid 1001 app && adduser --system --uid 1001 --ingroup app app \
 && mkdir -p /data && chown app:app /data

COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=worker --chown=app:app /app/workers ./workers

USER app
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
