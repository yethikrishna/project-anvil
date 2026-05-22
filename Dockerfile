# Anvil Base Dockerfile — Multi-stage build for Next.js apps
# Used as base for all Anvil app builds.
# Build with: docker build --build-arg APP_NAME=admin -f Dockerfile .

ARG APP_NAME=admin
ARG NODE_VERSION=22
ARG ALPINE_VERSION=3.20

# ── Stage 1: Dependencies ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json* ./
COPY turbo.json* ./

# Copy all package manifests (for workspace hoisting)
COPY packages/auth/package.json ./packages/auth/
COPY packages/billing/package.json ./packages/billing/
COPY packages/migration/package.json ./packages/migration/
COPY packages/security/package.json ./packages/security/
COPY packages/ui/package.json ./packages/ui/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/rate-limit/package.json ./packages/rate-limit/
COPY packages/next-config/package.json ./packages/next-config/

ARG APP_NAME
COPY apps/${APP_NAME}/package.json ./apps/${APP_NAME}/

# Install deps
RUN npm ci --prefer-offline 2>/dev/null || npm install

# ── Stage 2: Builder ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy source
COPY packages/ ./packages/
COPY apps/${APP_NAME} ./apps/${APP_NAME}/
COPY tsconfig.json* ./
COPY turbo.json* ./

ARG APP_NAME
ARG BUILD_VERSION=dev

# Set build env
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV BUILD_VERSION=${BUILD_VERSION}

# Build
WORKDIR /app/apps/${APP_NAME}
RUN npm run build 2>/dev/null || npx next build

# ── Stage 3: Runner ──
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
RUN apk add --no-cache libc6-compat curl tini

WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built artifacts
ARG APP_NAME
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP_NAME}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP_NAME}/.next/static ./apps/${APP_NAME}/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP_NAME}/public ./apps/${APP_NAME}/public 2>/dev/null || true

# Runtime env
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER nextjs

EXPOSE 3000

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fs http://localhost:3000/api/health || exit 1
