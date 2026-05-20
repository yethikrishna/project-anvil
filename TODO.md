# Project Anvil — TODO

## Phase 1: Infrastructure Foundation
- [x] Docker Compose with Keycloak, PostgreSQL, Redis, MinIO
- [x] Shared network + volume configuration
- [x] Keycloak realm + client setup scripts
- [x] Healthcheck endpoints for all services
- [x] `.env` template with all config vars

## Phase 2: SSO & Auth Layer
- [x] Authentik/Keycloak OIDC integration module
- [x] Shared auth middleware (Next.js)
- [x] PKCE flow implementation
- [x] Token refresh + silent auth (`prompt=none`)
- [x] Session propagation across all apps

## Phase 3: Google Drive Clone
- [x] Next.js 15 frontend (file browser, upload, download)
- [x] Express/Fastify backend with REST API
- [x] S3/MinIO BLOB storage integration
- [x] PostgreSQL materialized path directory schema
- [x] HTTP multipart streaming upload
- [x] Share links + permissions

## Phase 4: Google Docs Clone
- [x] Next.js 15 + Tiptap editor frontend
- [x] Yjs CRDT state sync
- [x] Hocuspocus WebSocket backend
- [x] Real-time cursor + presence
- [x] Document listing + management
- [x] Export to PDF/DOCX

## Phase 5: YouTube Clone
- [x] React + Tailwind frontend (video player, search, sidebar)
- [x] RapidAPI/YouTube API integration
- [x] Redux Toolkit caching + rate limiting
- [x] Debounced autocomplete search
- [x] Video metadata display
- [x] Playlist management

## Phase 6: Google Maps Clone
- [x] MapLibre GL JS + OpenMapTiles setup
- [x] Nominatim geocoding search
- [x] OSRM routing integration
- [x] WebGL vector tile rendering
- [x] `useGeolocation` hook + location overlay
- [x] Mobile-friendly slide-up sheet (Vaul)
- [x] Marker clustering for POI areas

## Phase 7: Google Search Clone
- [x] Meilisearch integration
- [x] Search-as-you-type UI
- [x] Hybrid BM25 + vector embedding search
- [x] MiniLM transformer for semantic queries
- [x] Search results page with rich snippets
- [x] "Did you mean" spelling suggestions
- [x] Image search tab (stub/mock)
- [x] Search API backend (Fastify + Meilisearch)
- [x] Setup scripts for hybrid search

## Phase 8: Gmail Clone
- [x] Stalwart Mail Server Docker setup
- [x] Next.js email client frontend
- [x] JMAP (RFC 8620) protocol client
- [x] Inbox, compose, thread views
- [x] SPF/DKIM/DMARC DNS configuration guide
- [x] RocksDB/PostgreSQL persistence
- [x] Tiptap rich text compose modal
- [x] Collapsible thread view with multiple messages
- [x] Labels/folders management
- [x] Star/archive/spam actions

## Phase 9: Cross-Cutting Features
- [x] Unified navigation shell (sidebar + app switcher)
- [x] Shared UI component library
- [x] Notification system
- [x] Dark/light theme
- [x] Mobile responsive layouts
- [x] OpenAPI 3.1 contract-first API spec (types in @anvil/api-client)

## Phase 10: Deployment & CI/CD
- [x] Vercel frontend deployment config
- [x] Render backend deployment (with keep-warm cron)
- [x] Neon PostgreSQL serverless setup
- [x] Supabase Storage for BLOBs
- [x] GitHub Actions CI pipeline
- [x] Pre-build API client generation (`@hey-api/openapi-ts`)

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
