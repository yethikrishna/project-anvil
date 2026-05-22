# Drive — Dockerfile
# Build context: repo root
# docker build --build-arg APP_NAME=drive --build-arg PORT=3001 -t ghcr.io/anvil-org/project-anvil/drive:latest .

ARG APP_NAME=drive
ARG PORT=3001
ARG BUILD_VERSION=dev
ARG NODE_VERSION=22
ARG ALPINE_VERSION=3.20

# ── Stage 1: Deps ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/auth/package.json ./packages/auth/
COPY packages/billing/package.json ./packages/billing/
COPY packages/security/package.json ./packages/security/
COPY packages/ui/package.json ./packages/ui/
COPY packages/next-config/package.json ./packages/next-config/
COPY apps/drive/package.json ./apps/drive/

RUN npm ci --prefer-offline || npm install

# ── Stage 2: Builder ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/ ./packages/
COPY apps/drive/ ./apps/drive/
COPY tsconfig.json* ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

WORKDIR /app/apps/drive
RUN npm run build 2>/dev/null || npx next build --no-lint

# ── Stage 3: Runner ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
RUN apk add --no-cache libc6-compat curl tini
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/drive/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/drive/.next/static ./apps/drive/.next/static
# Public dir (optional)
RUN mkdir -p ./apps/drive/public

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

USER nextjs
EXPOSE 3001

LABEL org.opencontainers.image.title="Anvil Drive"
LABEL org.opencontainers.image.source="https://github.com/anvil-org/project-anvil"
LABEL org.opencontainers.image.vendor="Anvil"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fs http://localhost:3001/api/health || exit 1
