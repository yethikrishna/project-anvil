# Project Anvil — TODO

## Phase 1: Infrastructure Foundation
- [x] Docker Compose with Keycloak, PostgreSQL, Redis, MinIO
- [x] Shared network + volume configuration
- [x] Keycloak realm + client setup scripts
- [x] Healthcheck endpoints for all services
- [x] `.env` template with all config vars

## Phase 2: SSO & Auth Layer
- [ ] Authentik/Keycloak OIDC integration module
- [ ] Shared auth middleware (Next.js)
- [ ] PKCE flow implementation
- [ ] Token refresh + silent auth (`prompt=none`)
- [ ] Session propagation across all apps

## Phase 3: Google Drive Clone
- [x] Next.js 15 frontend (file browser, upload, download)
- [x] Express/Fastify backend with REST API
- [x] S3/MinIO BLOB storage integration
- [x] PostgreSQL materialized path directory schema
- [x] HTTP multipart streaming upload
- [x] Share links + permissions

## Phase 4: Google Docs Clone
- [ ] Next.js 15 + Tiptap editor frontend
- [ ] Yjs CRDT state sync
- [ ] Hocuspocus WebSocket backend
- [ ] Real-time cursor + presence
- [ ] Document listing + management
- [ ] Export to PDF/DOCX

## Phase 5: YouTube Clone
- [ ] React + Tailwind frontend (video player, search, sidebar)
- [ ] RapidAPI/YouTube API integration
- [ ] Redux Toolkit caching + rate limiting
- [ ] Debounced autocomplete search
- [ ] Video metadata display
- [ ] Playlist management

## Phase 6: Google Maps Clone
- [ ] MapLibre GL JS + OpenMapTiles setup
- [ ] Nominatim geocoding search
- [ ] OSRM routing integration
- [ ] WebGL vector tile rendering
- [ ] `useGeolocation` hook + location overlay
- [ ] Mobile-friendly slide-up sheet (Vaul)

## Phase 7: Google Search Clone
- [ ] Meilisearch integration
- [ ] Search-as-you-type UI
- [ ] Hybrid BM25 + vector embedding search
- [ ] MiniLM transformer for semantic queries
- [ ] Search results page with rich snippets
- [ ] Mwmbl-inspired hash map index (stretch)

## Phase 8: Gmail Clone
- [ ] Stalwart Mail Server Docker setup
- [ ] Next.js email client frontend
- [ ] JMAP (RFC 8620) protocol client
- [ ] Inbox, compose, thread views
- [ ] SPF/DKIM/DMARC DNS configuration guide
- [ ] RocksDB/PostgreSQL persistence

## Phase 9: Cross-Cutting Features
- [ ] Unified navigation shell (sidebar + app switcher)
- [ ] Shared UI component library
- [ ] Notification system
- [ ] Dark/light theme
- [ ] Mobile responsive layouts
- [x] OpenAPI 3.1 contract-first API spec (types in @anvil/api-client)

## Phase 10: Deployment & CI/CD
- [ ] Vercel frontend deployment config
- [ ] Render backend deployment (with keep-warm cron)
- [ ] Neon PostgreSQL serverless setup
- [ ] Supabase Storage for BLOBs
- [ ] GitHub Actions CI pipeline
- [ ] Pre-build API client generation (`@hey-api/openapi-ts`)

## Phase 11: Portfolio & Documentation
- [ ] README with architecture diagrams
- [ ] System design documentation
- [ ] Engineering tradeoff explanations
- [ ] Resume-ready project descriptions
- [ ] Live demo URLs
- [ ] ATS keyword optimization

## Backlog (AI-Generated Features)
- [ ] AI-powered email categorization
- [ ] Smart file tagging in Drive
- [ ] Collaborative document templates
- [ ] Video transcript search
- [ ] Location-based search suggestions
- [ ] Voice-to-search integration
- [ ] Real-time collaboration analytics
- [ ] Plugin marketplace
