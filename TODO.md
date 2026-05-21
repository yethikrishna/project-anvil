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

## Phase Next: Trend-Informed Upgrades (2026-05-21)

### Editor Modernization
- [ ] Upgrade Tiptap 2 → 3 across Docs Clone (Phase 4)
- [ ] Add @tiptap/static-renderer for server-side document previews
- [ ] Evaluate Hocuspocus 4 migration for collaboration server
- [ ] Enable JSX renderHTML support for custom nodes
- [ ] Add previously-pro extensions now OSS: Drag Handle, Emoji, Math

### AI-Enhanced Search
- [ ] Upgrade Meilisearch to 1.16+ for multi-modal embeddings
- [x] Implement Conversational Search (Chats API) for document Q&A
- [ ] Add reranking stage to hybrid search pipeline
- [ ] Evaluate multi-modal Fragments API for image+text search
- [x] Add "Did you mean" semantic suggestions via LLM

### Local-First AI
- [ ] Add optional local embedding generation (Nomic/BGE-M3 via Ollama)
- [ ] Implement on-device document summarization
- [ ] Add WebGPU-based client-side embedding for search
- [ ] Create local RAG pipeline for private document search

### Framework Upgrades
- [ ] Plan Next.js 15 → 16 migration (Turbopack, React Compiler)
- [ ] Evaluate React 19.1 new features across all apps
- [ ] Plan MapLibre v6 migration (ESM-only, WebGL2)

### UI Polish
- [ ] Add View Transitions API for app-to-app navigation
- [ ] Implement same-document view transitions in page navigation
- [ ] Add cross-document transitions for multi-app flows

### Security Hardening (RFC 9700)
- [ ] Audit OAuth 2.0 flows against RFC 9700 best practices
- [ ] Add DPoP (RFC 9449) sender-constrained tokens
- [ ] Tighten CSP to Level 2+ on all auth endpoints
- [ ] Evaluate PAR (RFC 9126) for high-security scenarios
- [ ] Add exact redirect URI matching enforcement

### Supply Chain & CI/CD
- [ ] Add automated npm audit to CI pipeline
- [ ] Generate SBOMs for all packages
- [ ] Pin all dependency versions with lockfile
- [ ] Add OIDC federation for CI/CD (no stored secrets)
- [ ] Set up dependency scanning for container images

### Production Deployment
- [ ] Evaluate edge function deployment for search and geocoding APIs
- [ ] Plan production deployment strategy (edge vs. regional)
- [ ] Add observability and monitoring for distributed deployment

## Phase 10: Deployment & CI/CD
- [x] Vercel frontend deployment config
- [x] Render backend deployment (with keep-warm cron)
- [x] Neon PostgreSQL serverless setup
- [x] Supabase Storage for BLOBs
- [x] GitHub Actions CI pipeline
- [x] Pre-build API client generation (`@hey-api/openapi-ts`)

## Phase 11: Portfolio & Documentation
- [x] README with architecture diagrams
- [x] System design documentation
- [x] Engineering tradeoff explanations
- [x] Resume-ready project descriptions
- [x] Live demo URLs
- [x] ATS keyword optimization

## Phase 12: Research-Driven Enhancements (2026-05-20)
- [x] Evaluate **Loro 1.0** CRDT as Yjs alternative for Docs clone (richer merging, built-in versioning, 10-100× faster imports)
- [ ] Upgrade Meilisearch to **v1.13+** for production-stable hybrid/vector search
- [x] Add **Coolify v4** deployment option to CI/CD (self-hosted PaaS, push-to-deploy)
- [ ] Integrate Stalwart **JMAP Calendar/Contacts** (v0.14.0+) into Gmail clone for full workspace client
- [ ] Evaluate **Authentik** as Keycloak alternative (no Redis, SLO, simpler Docker deploy)
- [ ] Adopt **shadcn/ui blocks** (shadcnblocks.com) for shared productivity UI components
- [x] Add **Oracle Cloud Always Free** deployment guide (4 ARM OCPU + 24 GB RAM)
- [ ] Study **PeerTube** architecture for self-hosted video in YouTube clone
- [ ] Study **TubeArchivist** Elasticsearch approach for video metadata search
- [ ] Explore **Seafile** sync engine patterns for Drive clone desktop/mobile sync
- [ ] Upgrade **Hocuspocus to v4** (cross-runtime, memory optimization, edge deploy on CF Workers)
- [ ] Plan **Next.js 15 → 16 migration** (Cache Components, Turbopack default, async params)
- [ ] Evaluate **MLT vector tile format** for Maps clone (6× smaller tiles, Martin tile server)
- [ ] Use **PeerJS** for WebRTC P2P file sharing in Drive clone
- [ ] Evaluate **PowerSync** for offline-first Drive/Docs (SQLite ↔ PostgreSQL sync)
- [ ] Plan **MapLibre v6 migration** when stable (WebGL 2 only, ESM-only)
- [ ] Upgrade **Tiptap to 3.0** (smaller bundles, TS, Markdown extension, static renderer)
- [ ] Evaluate **Turso embedded replicas** for offline Drive/Docs (edge SQLite + microsecond reads)
- [ ] Evaluate **Bun + Elysia** as Fastify replacement (2–4× perf, auto OpenAPI)
- [ ] Integrate **FFmpeg.wasm** for YouTube client-side video preprocessing
- [ ] Add **Dexie.js** as client-side IndexedDB layer for offline features across all apps
- [ ] Add **WebGPU compute** path for Phase 15 image processing + analytics (70%+ browser support)
- [ ] Add **OTel browser SDK 2.0** for frontend-to-backend trace correlation (`@opentelemetry/auto-instrumentations-web`)
- [ ] Implement **Playwright visual regression** with `toHaveScreenshot()` for @anvil/ui components
- [ ] Evaluate **Drizzle ORM** for type-safe PostgreSQL queries (RLS, edge/serverless, PGlite WASM)
- [ ] Add **Zitadel** as third IAM evaluation option (Go, cloud-native, built-in multi-tenancy, AGPL-3.0)

## Backlog (AI-Generated Features)
- [x] AI-powered email categorization
- [x] Smart file tagging in Drive
- [x] Collaborative document templates
- [x] Video transcript search
- [x] Location-based search suggestions
- [x] Voice-to-search integration
- [x] Real-time collaboration analytics
- [x] Plugin marketplace

## Phase 13: AI Intelligence Layer
- [x] `@anvil/ai` package with provider abstraction (OpenAI, Ollama, local)
- [x] Semantic file search with pgvector + HNSW index
- [x] Cross-app AI Copilot sidebar (context-aware across all apps)
- [x] Client-side ML inference via ONNX/Wasm (email triage, doc autocomplete)
- [x] Natural language file search: "find the contract I sent to Acme Corp"
- [x] Document intelligence: auto TOC, style matching, version diff summary
- [x] Email thread summarization + sentiment analysis

## Phase 14: Power User Experience
- [x] Unified Command Palette (Cmd+K) across all apps
- [x] Cross-app drag-and-drop (file → email, video → doc, location → email)
- [x] Real-time presence indicators across the workspace shell
- [x] Keyboard shortcuts system (Vim-like for Docs, Gmail-style for Mail)
- [x] Global shortcuts: Cmd+1–6 for app switching
- [x] Mobile gesture navigation (swipe archive, pinch zoom, long-press select)

## Phase 15: Technical Showcase
- [ ] WASM image processing pipeline in Rust (resize, compress, filter — 10-50x faster)
- [ ] WebGPU-accelerated analytics dashboard (3D treemap, particle visualizations)
- [x] WebRTC P2P file sharing (encrypted browser-to-browser, no server)
- [x] E2EE for Docs/Drive with Web Crypto API + WebAuthn passkeys
- [x] Shared Worker threads: one WebSocket for all tabs
- [x] Performance monitoring dashboard (Core Web Vitals, custom traces)

## Phase 16: Calendar + Tasks (Integration Apps)
- [x] Calendar app (FullCalendar.js + rrule.js recurring events)
- [x] Smart scheduling: "find a time when all attendees are free"
- [x] Email → calendar event extraction ("Dinner Thursday?" → event)
- [x] Tasks/Keep app with cross-app task creation
- [x] Unified notification hub (SSE delivery, action buttons, smart batching)
- [x] Contact system shared across Gmail, Calendar, Drive

## Phase 17: Platform & Community
- [ ] Plugin system with SDK + sandboxed execution
- [x] Theme engine with live editor + community gallery
- [x] Public API + interactive playground (Swagger UI / Scalar)
- [x] Admin console: team management, usage analytics, audit logs
- [x] Stripe billing integration with usage-based tiers
- [ ] GraphQL Federation gateway (federated subgraphs per app)
- [x] MDX-powered blog + auto-generated changelog

## Phase 18: Modern Web Platform (Polish)
- [x] View Transitions API for cross-app navigation animations
- [x] Scroll-driven CSS animations (parallax, staggered reveals, progress bars)
- [x] CSS Container Queries for adaptive component rendering
- [x] Popover API + Anchor Positioning for menus and tooltips
- [ ] `<selectlist>` customizable selects across all apps

## Phase 19: Accessibility & Internationalization
- [ ] WCAG 2.2 AA compliance with axe-core CI integration
- [ ] Accessibility score dashboard per app
- [ ] Screen reader-optimized mode (ARIA live regions, landmark nav)
- [x] Voice control interface via Web Speech API
- [x] `@anvil/i18n` package with type-safe keys + RTL support
- [x] Locale-aware formatting (dates, numbers, distances, file sizes)

## Phase 20: Testing & Observability
- [x] Test pyramid: Vitest (unit) + testcontainers (integration) + Playwright (E2E)
- [ ] Visual regression testing in CI (Playwright screenshots)
- [x] k6 load testing scripts with performance baselines
- [x] OpenTelemetry distributed tracing (frontend → API → DB → S3)
- [x] Real-time error tracking (custom Sentry-lite)
- [ ] Performance budget enforcement in CI (Lighthouse CI)
- [ ] Developer playground (API explorer, CRDT debug visualizer)
- [ ] Contract testing between services (Pact-style)

## Phase 21: Novel Interactions & Analytics
- [x] Smart Clipboard (copy file from Drive → paste into Gmail as attachment)
- [x] Focus modes: Zen (Docs), Inbox Zero (Gmail), Deep Work (cross-app)
- [ ] Smart bookmarks/pins across all apps + AI-suggested pins
- [x] Spatial navigation for grids and lists (keyboard-driven)
- [x] Activity timeline across all apps ("12 emails, 3 docs, 1 upload today")
- [ ] Email analytics (response time, volume heatmap, top correspondents)
- [ ] Drive analytics (storage by type, duplicates, shared file audit)
- [ ] Collaboration analytics (edit heatmap, timezone visualization)

## Phase 22: Security Hardening
- [x] Security headers + CSP nonce policy on all apps (target A+ on SecurityHeaders.com)
- [ ] OWASP Top 10 audit document with per-risk mitigation proof
- [ ] Session security: device fingerprinting, revocation, login history
- [ ] API key management with scoped permissions + request signing
- [ ] Dependency audit pipeline (npm audit + trivy + SBOM in CI)
- [x] Rate limiting on all endpoints (token bucket rate limiter)

## Phase 23: Google Photos Clone
- [ ] Timeline view with virtualized infinite scroll
- [ ] Album management (auto + manual) + sharing
- [ ] EXIF metadata extraction + search
- [ ] Face detection + clustering (face-api.js / ONNX model)
- [ ] Scene detection (MobileNet) + semantic photo search (CLIP)
- [ ] Duplicate detection via perceptual hashing (WASM)
- [ ] Map view: geotagged photos on MapLibre
- [ ] Progressive image loading with blur-up placeholders
- [ ] `@anvil/media` shared package (Photos, Drive, YouTube)

## Phase 24: Chat + Video Calling (WebRTC)
- [ ] Direct messages + group channels + threaded conversations
- [ ] Message search via Meilisearch integration
- [ ] 1:1 video calls with WebRTC + screen sharing
- [ ] Virtual backgrounds (TensorFlow.js body segmentation)
- [ ] Audio visualization via Web Audio API
- [ ] Multi-party calling with mediasoup SFU
- [ ] Typing indicators + read receipts + presence

## Phase 25: Desktop & Mobile
- [ ] Tauri 2.0 desktop app (10MB, system tray, native dialogs)
- [ ] PWA with Web Push + offline access + share target
- [ ] React Native mobile app (Expo, biometric auth, camera)

## Phase 26: Data Portability & Compliance
- [ ] Google Takeout import (Gmail mbox, Drive metadata, Photos)
- [ ] Universal export (Anvil Takeout) — all data as structured JSON
- [ ] GDPR compliance suite (cookie consent, data retention, right to erasure)
- [ ] Multi-tenancy (organization workspaces, row-level security, custom branding)
- [ ] Email migration via IMAP import
- [ ] File migration from Google Drive / Dropbox / OneDrive
- [ ] Calendar iCal/CalDAV sync + contact CardDAV sync

## Phase 27: Design System & Storybook
- [ ] Storybook 8+ for all @anvil/ui components with interactive docs
- [ ] Design tokens (JSON → CSS variables) with Figma integration
- [ ] Visual regression testing via Chromatic
- [ ] Pattern library: pre-built page patterns with copy-paste code

## Phase 28: Gamification & Engagement
- [ ] Productivity score (daily activity across apps)
- [ ] Achievement/badge system ("Inbox Zero", "Power User", "Collaborator")
- [ ] Onboarding quests as guided tutorials
- [ ] Trophy case on profile page

## Phase 29: Ambient UX & Widgets
- [ ] Customizable dashboard with drag-and-drop widgets
- [ ] Browser new-tab extension with Anvil quick access
- [ ] Ambient screensaver mode (photos, calendar, weather)

## Phase 30: Developer Experience
- [ ] One-command setup (`docker compose up` with demo data)
- [ ] Dev containers + GitHub Codespaces config
- [ ] Architecture Decision Records (ADRs)
- [ ] Contribution guide with "good first issue" labels
- [ ] Semantic versioning + auto-changelog

## Phase 31: Workflow Automation (Anvil Flows)
- [ ] Trigger + action system across all apps (20+ trigger/action types)
- [ ] Visual drag-and-drop flow builder (React Flow)
- [ ] BullMQ execution pipeline with retry + error handling
- [ ] Template library: pre-built flows (invoice processing, weekly digest, meeting prep)
- [ ] Cron triggers: "Every Friday at 5pm → email summary"
- [ ] Community flow sharing via marketplace

## Phase 32: Collaborative Whiteboard
- [ ] Infinite canvas with drawing tools (pen, shapes, text, sticky notes, arrows)
- [ ] Real-time multi-user collaboration via Yjs CRDT
- [ ] Laser pointer mode for presentations
- [ ] Export to PNG/SVG/PDF
- [ ] Embed in Docs as a doc block
- [ ] Templates: wireframe, mind map, flowchart, retrospective
- [ ] Tech: Excalidraw library wrapped as Anvil app

## Phase 33: Passwordless Auth + Passkeys
- [ ] WebAuthn/FIDO2 passkeys for passwordless login
- [ ] Magic link email login
- [ ] QR code login from mobile
- [ ] Hardware security key support (YubiKey)
- [ ] Account recovery without passwords (trusted devices)
- [ ] Tech: @simplewebauthn/server + browser WebAuthn API

## Phase 34: Multi-Layer Cache Architecture
- [ ] Browser: Service Worker cache for static assets
- [ ] CDN: Edge cache with stale-while-revalidate
- [ ] Application: Redis cache with per-type TTL + event-driven invalidation
- [ ] Database: PostgreSQL materialized views for analytics
- [ ] Cache invalidation via Redis pub/sub (write-through for search)
- [ ] Documented architecture diagram as portfolio artifact

## Phase 35: White-Label / Embed Mode
- [ ] Embeddable app iframes with custom branding
- [ ] Dynamic theming via query params (?brand=acme&primary=#3b82f6)
- [ ] SSO passthrough for embedded sessions
- [ ] postMessage API for parent-child communication
- [ ] CSP frame-ancestors configuration

## Phase 36: Google Sheets Clone
- [ ] Virtual-scroll grid rendering (millions of cells)
- [ ] Formula engine via Formualizer (Rust → WASM, 400+ Excel functions)
- [ ] Dependency graph with incremental recalculation
- [ ] Real-time CRDT co-editing via Yjs (cell-level locking)
- [ ] Cell formatting, conditional formatting, data validation
- [ ] Charts: bar, line, pie, scatter, area (canvas/SVG)
- [ ] Pivot table builder
- [ ] Import .xlsx/.csv/.tsv, export .xlsx/.csv/.pdf
- [ ] Cross-sheet references, named ranges, freeze panes
- [ ] Comment threads on cells + version history

## Phase 37: Google Slides Clone
- [ ] Canvas-based slide editor (Fabric.js / Konva.js)
- [ ] Text boxes, images, shapes, lines, tables
- [ ] Master slides & layout templates
- [ ] Slide transitions + presentation mode (fullscreen)
- [ ] Speaker notes pane + slide sorter view
- [ ] Real-time CRDT co-editing + element-level locking
- [ ] Export to PDF
- [ ] Template gallery (pitch deck, report, photo album)

## Phase 38: Google Forms Clone
- [ ] Drag-and-drop question builder
- [ ] Question types: text, choice, dropdown, scale, date, file upload
- [ ] Conditional logic (section branching based on answer)
- [ ] Responses auto-populate Sheets clone
- [ ] Response summary with auto-generated charts
- [ ] Public link sharing + embed code + QR code
- [ ] Required field validation, response limits
- [ ] CSV/JSON export

## Phase 39: Deep Linking & URL State
- [ ] Universal URL scheme across all apps (every state = URL)
- [ ] Shareable deep links with permission scoping
- [ ] Link expiration + password protection + one-time view
- [ ] Cross-app deep linking (email → doc, calendar → drive)
- [ ] `@anvil/deep-link` package + shell router integration

## Phase 40: Portfolio Showcase Site
- [ ] Landing page with animated app previews + architecture diagram
- [ ] Case study pages per app (system design interview format)
- [ ] Interactive `/resume` route with skills matrix + timeline
- [ ] Performance benchmarks + side-by-side with Google
- [ ] ATS-optimized PDF resume export

## Backlog (Architecture)
- [ ] Micro-frontend shell with Module Federation
- [ ] Edge computing (Cloudflare Workers / Vercel Edge) for auth + caching
- [ ] Event sourcing for Docs (time-travel, branch & merge)
- [ ] Full offline PWA with Workbox (Service Worker + Background Sync)
- [ ] Progressive enhancement: works without JS for core flows
