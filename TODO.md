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
- [ ] Export to PDF/DOCX

## Phase 5: YouTube Clone
- [x] React + Tailwind frontend (video player, search, sidebar)
- [x] RapidAPI/YouTube API integration
- [x] Redux Toolkit caching + rate limiting
- [x] Debounced autocomplete search
- [x] Video metadata display
- [x] Playlist management

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

## Phase 12: AI Intelligence Layer
- [ ] `@anvil/ai` package with provider abstraction (OpenAI, Ollama, local)
- [ ] Semantic file search with pgvector + HNSW index
- [ ] Cross-app AI Copilot sidebar (context-aware across all apps)
- [ ] Client-side ML inference via ONNX/Wasm (email triage, doc autocomplete)
- [ ] Natural language file search: "find the contract I sent to Acme Corp"
- [ ] Document intelligence: auto TOC, style matching, version diff summary
- [ ] Email thread summarization + sentiment analysis

## Phase 13: Power User Experience
- [ ] Unified Command Palette (Cmd+K) across all apps
- [ ] Cross-app drag-and-drop (file → email, video → doc, location → email)
- [ ] Real-time presence indicators across the workspace shell
- [ ] Keyboard shortcuts system (Vim-like for Docs, Gmail-style for Mail)
- [ ] Global shortcuts: Cmd+1–6 for app switching
- [ ] Mobile gesture navigation (swipe archive, pinch zoom, long-press select)

## Phase 14: Technical Showcase
- [ ] WASM image processing pipeline in Rust (resize, compress, filter — 10-50x faster)
- [ ] WebGPU-accelerated analytics dashboard (3D treemap, particle visualizations)
- [ ] WebRTC P2P file sharing (encrypted browser-to-browser, no server)
- [ ] E2EE for Docs/Drive with Web Crypto API + WebAuthn passkeys
- [ ] Shared Worker threads: one WebSocket for all tabs
- [ ] Performance monitoring dashboard (Core Web Vitals, custom traces)

## Phase 15: Calendar + Tasks (Integration Apps)
- [ ] Calendar app (FullCalendar.js + rrule.js recurring events)
- [ ] Smart scheduling: "find a time when all attendees are free"
- [ ] Email → calendar event extraction ("Dinner Thursday?" → event)
- [ ] Tasks/Keep app with cross-app task creation
- [ ] Unified notification hub (SSE delivery, action buttons, smart batching)
- [ ] Contact system shared across Gmail, Calendar, Drive

## Phase 16: Platform & Community
- [ ] Plugin system with SDK + sandboxed execution
- [ ] Theme engine with live editor + community gallery
- [ ] Public API + interactive playground (Swagger UI / Scalar)
- [ ] Admin console: team management, usage analytics, audit logs
- [ ] Stripe billing integration with usage-based tiers
- [ ] GraphQL Federation gateway (federated subgraphs per app)
- [ ] MDX-powered blog + auto-generated changelog

## Backlog (Architecture)
- [ ] Micro-frontend shell with Module Federation
- [ ] Edge computing (Cloudflare Workers / Vercel Edge) for auth + caching
- [ ] Event sourcing for Docs (time-travel, branch & merge)
- [ ] Full offline PWA with Workbox (Service Worker + Background Sync)
- [ ] Progressive enhancement: works without JS for core flows
