# T3 Code server container for cloud environments.
#
# Builds the monorepo with Bun, then copies the compiled server bundle
# into a slim Node runtime image and runs it on port 3773 by default.
#
# Designed to be deployed to any container host (Fly.io, Railway, Render,
# Kubernetes, a bare VM running Docker, etc.). A few things to know:
#
#   - node-pty is a native dependency and needs python3 + build-essential
#     to compile during the install step; the runtime image already has
#     a prebuilt binary so we don't drag those build tools into prod.
#   - The server persists state under /data (SQLite + auth). Mount a
#     volume at /data so sessions survive restarts. Fly.io does this
#     automatically via the `[mounts]` section in fly.toml.
#   - T3CODE_HOST must be 0.0.0.0 for the container to accept external
#     traffic; T3CODE_PORT defaults to 3773.

############################
# Stage 1 — build
############################
FROM node:22-bookworm AS builder

WORKDIR /repo

# Install Bun for the workspace build, plus OS-level deps for node-pty.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 \
      build-essential \
      ca-certificates \
      curl \
      unzip \
 && curl -fsSL https://bun.sh/install | bash \
 && rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.bun/bin:${PATH}"

# Copy workspace manifests first so bun install can be cached.
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/marketing/package.json ./apps/marketing/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/shared/package.json ./packages/shared/
COPY packages/client-runtime/package.json ./packages/client-runtime/
COPY scripts/package.json ./scripts/

RUN bun install --frozen-lockfile

# Bring in the rest of the source and build the server + its dependencies.
COPY . .

RUN bun run --filter @t3tools/contracts build \
 && bun run --filter @t3tools/shared build \
 && bun run --filter @t3tools/client-runtime build \
 && bun run --filter @t3tools/web build \
 && bun run --filter t3 build

############################
# Stage 2 — runtime
############################
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV T3CODE_HOST=0.0.0.0
ENV T3CODE_PORT=3773
ENV T3CODE_BASE_DIR=/data

WORKDIR /app

# ca-certificates is needed for outbound HTTPS (Codex / Claude API calls).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      tini \
 && rm -rf /var/lib/apt/lists/*

# Copy the built monorepo from the builder. The server's runtime picks
# up the compiled dist/ output and the shared packages through workspace
# resolution handled by `bun install` in the builder stage.
COPY --from=builder /repo /app

# Persisted state (SQLite, auth bootstrap, worktrees) lives here.
RUN mkdir -p /data \
 && chown -R node:node /app /data
USER node

VOLUME ["/data"]
EXPOSE 3773

# tini reaps zombie child processes (codex / claude CLIs).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/server/dist/bin.mjs", "serve"]
