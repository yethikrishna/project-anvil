# Project Anvil — Resume-Ready Descriptions

Copy-paste project descriptions optimized for ATS keyword matching and technical interviews.

---

## Full-Stack Engineer / Senior Software Engineer

### Project Anvil — Federated Google Workspace Clone
**Tech:** Next.js 15, React 19, TypeScript, Fastify, PostgreSQL, Keycloak OIDC, Yjs CRDT, Meilisearch, MapLibre GL, Tailwind CSS, Turborepo, Docker

Architected and built a production-grade Google Workspace alternative comprising 6 interconnected applications (Drive, Docs, YouTube, Maps, Search, Gmail) in a pnpm/Turborepo monorepo. Implemented SSO authentication via Keycloak OIDC with PKCE flow, enabling seamless session propagation across all apps. Built a real-time collaborative document editor using Tiptap + Yjs CRDTs synced via Hocuspocus WebSocket server. Designed a hybrid search engine combining Meilisearch BM25 lexical search with MiniLM transformer vector embeddings for semantic query matching. Implemented a file storage system with S3-compatible BLOB storage (MinIO), materialized path directory schema, and pre-signed share links. Built a vector tile map renderer using MapLibre GL with Nominatim geocoding, OSRM routing, and WebGL-powered marker clustering. Developed a JMAP-based email client (RFC 8620) with Stalwart mail server, Tiptap rich text compose, and collapsible thread views. Created a shared component library (`@anvil/ui`) with DataTable, Modal, Tabs, Toast, Tooltip, and Skeleton loaders used across all 6 apps. Implemented a dark/light theme system with CSS variables and ThemeProvider context. Built a real-time notification system using Fastify WebSocket server with React hooks for live toast alerts. Configured CI/CD with GitHub Actions, Vercel (frontend), and Render (backend) with keep-warm crons.

**Keywords:** Next.js, React, TypeScript, Fastify, PostgreSQL, Redis, OIDC, OAuth2, PKCE, CRDT, WebSocket, REST API, S3, MinIO, Docker, Turborepo, Tailwind CSS, Meilisearch, MapLibre GL, JMAP, SMTP, CI/CD, GitHub Actions, Vercel, Render, Neon, Supabase

---

## Frontend Engineer

### Project Anvil — 6-App Frontend Ecosystem
**Tech:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Tiptap, Yjs, MapLibre GL, Redux Toolkit, Zustand

Built 6 production React applications sharing a unified design system and navigation shell. Developed a real-time collaborative rich text editor using Tiptap with Yjs CRDT for conflict-free multi-user editing, including live cursor presence and document persistence. Created a file browser with drag-and-drop upload, context menus, breadcrumbs, and file preview modals. Implemented a video discovery app with debounced autocomplete search, Redux-cached results, and playlist management. Built a WebGL vector map renderer with geocoding search, turn-by-turn routing, GPS location tracking, and mobile slide-up panels. Developed a hybrid search interface with tabbed results (All/Images/News), "Did you mean" suggestions, and semantic result ranking. Constructed a JMAP email client with collapsible thread views, rich text compose, label management, and star/archive actions. Designed a shared component library (`@anvil/ui`) with 15+ reusable components (DataTable, Modal, Dropdown, Tabs, Toast, Tooltip, Skeleton). Implemented responsive mobile layouts with hamburger navigation, bottom tab bars, and slide-over sidebars. Built a dark/light theme system with CSS custom properties and React context provider.

**Keywords:** React, Next.js, TypeScript, Tailwind CSS, CRDT, WebSocket, Tiptap, MapLibre, Redux, Zustand, Responsive Design, Dark Mode, Component Library, Design System, Accessibility

---

## Backend / Infrastructure Engineer

### Project Anvil — Microservices Backend Platform
**Tech:** Fastify, Node.js, PostgreSQL, Redis, Keycloak, MinIO/S3, Stalwart, Meilisearch, Docker Compose, GitHub Actions

Designed and deployed a multi-service backend platform supporting 6 frontend applications. Built REST APIs with Fastify featuring JSON Schema validation, JWT authentication, and streaming multipart uploads. Implemented Keycloak OIDC SSO with PKCE flow, HTTP-only encrypted session cookies, and automatic token refresh (5 min before expiry). Configured Stalwart mail server with JMAP protocol support, SPF/DKIM/DMARC DNS records, and RocksDB/PostgreSQL dual persistence. Set up Meilisearch with custom ranking rules, typo tolerance, and MiniLM transformer for hybrid BM25 + vector semantic search. Deployed MinIO S3-compatible storage with pre-signed URLs and materialized path directory schema for hierarchical file management. Built a Fastify WebSocket notification server with user-scoped channels and REST API fallback. Containerized all infrastructure with Docker Compose (Keycloak, PostgreSQL, Redis, MinIO, Stalwart, Meilisearch). Configured CI/CD with GitHub Actions (lint, typecheck, build, test) and deployment to Vercel (frontend) + Render (backend with keep-warm crons). Set up Neon serverless PostgreSQL and Supabase Storage with RLS policies for production deployment.

**Keywords:** Node.js, Fastify, PostgreSQL, Redis, Docker, OIDC, OAuth2, S3, SMTP, JMAP, WebSocket, REST API, CI/CD, GitHub Actions, Neon, Supabase, Serverless

---

## Short Version (1-2 lines for resume bullet points)

- **Project Anvil**: Built a 6-app Google Workspace clone (Drive, Docs, YouTube, Maps, Search, Gmail) in a Turborepo monorepo with Next.js 15, Fastify, Keycloak OIDC SSO, Yjs CRDT real-time collaboration, Meilisearch hybrid search, MapLibre vector maps, JMAP email, and Docker/CI/CD deployment.
- Architected SSO auth with Keycloak OIDC/PKCE flowing across 6 apps, real-time doc editing with Yjs CRDTs via Hocuspocus WebSocket, and hybrid BM25 + vector semantic search with Meilisearch + MiniLM.
- Developed a shared component library with 15+ components, dark/light theme system, responsive mobile layouts, and WebSocket notification server used across all apps.

---

## Interview Talking Points

1. **CRDTs**: "I used Yjs CRDTs for collaborative editing because they handle network partitions gracefully — unlike OT, CRDTs don't need a central server to resolve conflicts. Each client can edit independently and merge later."

2. **PKCE Flow**: "I implemented PKCE because the auth code grant alone is vulnerable to code interception attacks on public clients (SPAs). PKCE adds a code_verifier/code_challenge pair that proves the token request comes from the same client that initiated the auth request."

3. **Hybrid Search**: "BM25 is great for keyword matching but fails on semantic similarity — searching 'how to deploy' won't find 'deployment guide'. By combining BM25 with MiniLM vector embeddings, I get both lexical precision and semantic understanding, ranked with a tunable 60/40 split."

4. **Materialized Path**: "I chose materialized path over adjacency list for the file directory tree because it enables single-query subtree retrieval (WHERE path LIKE '/root/folder/%') without recursive CTEs. The tradeoff is path updates on rename, but renames are rare compared to reads."

5. **JMAP over IMAP**: "JMAP is the modern replacement for IMAP — it's JSON-based, supports batch operations, and has built-in push. IMAP requires multiple round-trips for operations that JMAP handles in a single request. The RFC was published in 2019 and Stalwart is one of the first servers to fully implement it."

6. **Turborepo**: "Turborepo's task graph caching means unchanged apps don't rebuild. With 6 frontends and 4 shared packages, this cuts CI time from ~8 minutes to ~2 minutes on average."
