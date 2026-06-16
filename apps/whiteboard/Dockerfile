# Whiteboard — Dockerfile
ARG NODE_VERSION=22
ARG ALPINE_VERSION=3.20

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/auth/package.json ./packages/auth/
COPY packages/ui/package.json ./packages/ui/
COPY packages/next-config/package.json ./packages/next-config/
COPY packages/notifications/package.json ./packages/notifications/
COPY apps/whiteboard/package.json ./apps/whiteboard/
RUN npm ci --prefer-offline || npm install

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY packages/ ./packages/
COPY apps/whiteboard/ ./apps/whiteboard/
COPY tsconfig.json* ./
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
WORKDIR /app/apps/whiteboard
RUN npx next build --no-lint

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
RUN apk add --no-cache libc6-compat curl tini
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/whiteboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/whiteboard/.next/static ./apps/whiteboard/.next/static
RUN mkdir -p ./apps/whiteboard/public
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3012 HOSTNAME=0.0.0.0
USER nextjs
EXPOSE 3012
LABEL org.opencontainers.image.title="Anvil Whiteboard"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fs http://localhost:3012/api/health || exit 1
