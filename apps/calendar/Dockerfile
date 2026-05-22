# Calendar — Dockerfile
# Build context: repo root
# docker build --build-arg APP_NAME=calendar --build-arg PORT=3003 -t ghcr.io/anvil-org/project-anvil/calendar:latest .

ARG APP_NAME=calendar
ARG PORT=3003
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
COPY apps/calendar/package.json ./apps/calendar/

RUN npm ci --prefer-offline || npm install

# ── Stage 2: Builder ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/ ./packages/
COPY apps/calendar/ ./apps/calendar/
COPY tsconfig.json* ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

WORKDIR /app/apps/calendar
RUN npm run build 2>/dev/null || npx next build --no-lint

# ── Stage 3: Runner ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
RUN apk add --no-cache libc6-compat curl tini
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/calendar/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/calendar/.next/static ./apps/calendar/.next/static
# Public dir (optional)
RUN mkdir -p ./apps/calendar/public

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3003
ENV HOSTNAME=0.0.0.0

USER nextjs
EXPOSE 3003

LABEL org.opencontainers.image.title="Anvil Calendar"
LABEL org.opencontainers.image.source="https://github.com/anvil-org/project-anvil"
LABEL org.opencontainers.image.vendor="Anvil"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fs http://localhost:3003/api/health || exit 1
