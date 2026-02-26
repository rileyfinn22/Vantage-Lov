# FROM node:24-bookworm-slim AS base

# Install pnpm
# RUN npm install -g pnpm

FROM debian:12-slim AS base
WORKDIR /app
COPY mise.prod.toml mise.toml
RUN apt-get update  \
    && apt-get -y --no-install-recommends install  \
    # install any other dependencies you might need
    sudo curl git ca-certificates \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV MISE_DATA_DIR="/mise"
ENV MISE_CONFIG_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV PATH="/mise/shims:$PATH"
# ENV MISE_VERSION="..."

RUN curl https://mise.run | sh

COPY mise.prod.toml mise.toml
RUN mise trust && mise install && eval "$(mise activate bash)"
FROM base AS app_build
WORKDIR /build
COPY mise.prod.toml mise.toml
RUN mise trust && mise install && eval "$(mise activate bash)"
RUN pnpm config set store-dir /pnpm/store

ENV CI=true

# Copy workspace configuration and package files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

# Install all workspace dependencies with single command
RUN pnpm install

# Copy source code for both (backend first so frontend can reference types)
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Generate Hono types from backend
RUN cd backend && pnpm tsc

# Build frontend (now it can access backend types)
RUN cd frontend && pnpm run build

FROM base AS final
WORKDIR /app

ENV MISE_SOPS_STRICT=false
# Set environment variable for frontend path
ENV FRONTEND_DIST_PATH=/app/frontend/dist

# Accept SOPS age key as build argument
# ARG MISE_SOPS_AGE_KEY
# ENV MISE_SOPS_AGE_KEY=${MISE_SOPS_AGE_KEY}

# Copy encrypted secrets file for mise to decrypt
COPY prodsecret.env.yaml ./

# Age key is now provided via SOPS_AGE_KEY environment variable from Secret Manager
# No need to copy the key file into the image

# Add healthcheck
# HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --start-interval=2s --retries=3 \
HEALTHCHECK --interval=10s --timeout=2s --retries=3 \
    CMD curl -f http://localhost:3030/health

# Install curl for healthcheck
# RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy workspace configuration for production dependencies
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
# COPY --from=app_build /build/backend/package.json ./backend/
# Install production dependencies for workspace with cache mount
# RUN --mount=type=cache,id=pnpm,target=/pnpm/store MISE_SOPS_STRICT=false bash -c 'pnpm config set store-dir /pnpm/store && pnpm install --prod'
# ENV MISE_VERBOSE=1

# Copy built frontend
COPY --from=app_build /build/frontend/dist ./frontend/dist
COPY backend/ backend/
RUN pnpm install

WORKDIR /app/backend

ENV MISE_SOPS_STRICT=true
ENV NODE_ENV=production
EXPOSE 3030
# Start the backend server
CMD ["mise", "x", "--", "pnpm", "tsx", "--import", "./src/instrumentation.ts", "./src/node.ts"]
