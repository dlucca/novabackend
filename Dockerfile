# syntax=docker/dockerfile:1
#
# Multi-stage build optimized for Railway Metal builders.
# Switched base from node:20-alpine → node:20-slim because Medusa's
# dependency tree pulls native modules (sharp, bcrypt, etc.) that don't
# publish prebuilt binaries for musl (Alpine). On slim (Debian) those
# binaries download in seconds; on Alpine they were compiling from C++,
# adding 15-20 minutes per cold install.
#
# Final image is slightly larger (~150 MB) but build time drops from
# ~30 min to ~8-12 min per deploy. Worth it for an internal backend.

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

COPY package*.json ./
# --prefer-offline: skip network calls when local cache has the package
# --no-audit: skip the security audit roundtrip
# --no-fund: skip the funding-info CLI noise
RUN --mount=type=cache,id=s/a5d73af9-4d60-47aa-b838-0107c781d02c-/root/.npm,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

# ── Stage 2: build the app ───────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Cache TypeScript incremental output + Medusa admin Vite cache between
# builds. These directories are populated by the build but invalidated
# when source changes — the cache mount preserves the unchanged parts.
# Railway requires explicit `id` on every cache mount; the prefix
# `s/<service-id>-` namespaces the cache to this service.
RUN --mount=type=cache,id=s/a5d73af9-4d60-47aa-b838-0107c781d02c-build-cache,target=/app/node_modules/.cache \
    --mount=type=cache,id=s/a5d73af9-4d60-47aa-b838-0107c781d02c-vite-cache,target=/app/.medusa/admin/node_modules/.vite \
    npm run build \
    && ln -sf /app/node_modules /app/.medusa/server/node_modules

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app

COPY --from=builder /app /app
WORKDIR /app/.medusa/server

EXPOSE 9000
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
