# Photos — Dockerfile
# Build context: repo root
# docker build -f apps/photos/Dockerfile -t ghcr.io/anvil-org/photos:latest .

ARG NODE_VERSION=22
ARG ALPINE_VERSION=3.20

# ── Stage 1: Deps ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
RUN apk add --no-cache libc6-compat python3 make g++ vips-dev
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/auth/package.json ./packages/auth/
COPY packages/ui/package.json ./packages/ui/
COPY packages/next-config/package.json ./packages/next-config/
COPY packages/notifications/package.json ./packages/notifications/
COPY apps/photos/package.json ./apps/photos/

RUN npm ci --prefer-offline || npm install

# ── Stage 2: Builder ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
RUN apk add --no-cache libc6-compat vips-dev
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/ ./packages/
COPY apps/photos/ ./apps/photos/
COPY tsconfig.json* ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

WORKDIR /app/apps/photos
RUN npx next build --no-lint

# ── Stage 3: Runner ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
RUN apk add --no-cache libc6-compat curl tini imagemagick vips
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/photos/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/photos/.next/static ./apps/photos/.next/static
RUN mkdir -p ./apps/photos/public

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3011
ENV HOSTNAME=0.0.0.0

USER nextjs
EXPOSE 3011

LABEL org.opencontainers.image.title="Anvil Photos"
LABEL org.opencontainers.image.source="https://github.com/anvil-org/project-anvil"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fs http://localhost:3011/api/health || exit 1
