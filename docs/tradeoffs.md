# Project Anvil — Engineering Tradeoffs

Key technical decisions and the reasoning behind them.

## 1. Keycloak vs Authentik (SSO Provider)

**Chose: Keycloak**

| Factor         | Keycloak          | Authentik          |
|----------------|-------------------|--------------------|
| Maturity       | 20+ years (JBoss) | ~4 years           |
| OIDC Support   | Full RFC 6749     | Full, but newer    |
| Community      | Large, Red Hat    | Growing, smaller   |
| Performance    | Proven at scale   | Good, less tested  |
| PKCE Support   | Native            | Native             |
| Admin UI       | Functional        | Modern, polished   |

**Decision**: Keycloak's battle-tested OIDC implementation and massive community made it the safer choice for a portfolio project demonstrating enterprise-grade SSO. Authentik has a nicer UI but less production evidence.

**Tradeoff**: Keycloak's admin console feels dated. We mitigate this with our own `@anvil/auth` package that provides clean React hooks and hides Keycloak's complexity.

---

## 2. Fastify vs Express (API Framework)

**Chose: Fastify**

| Factor         | Fastify            | Express            |
|----------------|--------------------|--------------------|
| Throughput     | ~76k req/s         | ~15k req/s         |
| Schema Validation | JSON Schema built-in | Requires middleware |
| TypeScript     | First-class        | Community types    |
| Plugin System  | Encapsulated       | Middleware chain   |
| Ecosystem      | Smaller            | Massive            |

**Decision**: Fastify's 5x throughput advantage and native JSON Schema validation made it the clear choice for building performant APIs. The smaller ecosystem is rarely an issue for greenfield projects.

**Tradeoff**: Some Express middleware isn't available for Fastify. We write custom plugins when needed, which is actually cleaner than the Express middleware soup.

---

## 3. Yjs + Hocuspocus vs Liveblocks (Real-time Collaboration)

**Chose: Yjs + Hocuspocus**

| Factor         | Yjs + Hocuspocus   | Liveblocks         |
|----------------|--------------------|--------------------|
| Self-hosted    | ✅ Fully           | ❌ SaaS only        |
| Cost           | Free (infrastructure) | Per-user pricing |
| Protocol       | CRDT (Yjs)         | CRDT (custom)      |
| Editor Binding | Tiptap, ProseMirror, etc. | Limited       |
| Latency        | LAN-speed          | Internet-dependent |
| Vendor Lock-in | None               | Full               |

**Decision**: Self-hosting eliminates vendor dependency and demonstrates infrastructure skill. CRDTs are also intellectually interesting to implement.

**Tradeoff**: Hocuspocus requires more ops work (scaling, persistence) compared to a managed service. For a portfolio project, this ops experience is valuable.

---

## 4. MapLibre GL vs Leaflet (Maps)

**Chose: MapLibre GL**

| Factor         | MapLibre GL         | Leaflet             |
|----------------|---------------------|---------------------|
| Rendering      | WebGL (GPU)         | DOM/SVG (CPU)       |
| Data Format    | Vector tiles (MVT)  | Raster tiles        |
| Performance    | Smooth 100k+ points | Slows after 10k     |
| 3D/terrain     | Built-in            | Plugin needed       |
| Bundle Size    | ~200KB gzipped      | ~40KB gzipped       |

**Decision**: WebGL rendering and vector tiles are the modern standard for mapping applications. MapLibre GL handles large datasets gracefully, which matters for POI clustering.

**Tradeoff**: Larger bundle size and steeper learning curve. Leaflet is simpler but doesn't scale to production map workloads.

---

## 5. Meilisearch vs Elasticsearch (Search)

**Chose: Meilisearch**

| Factor         | Meilisearch         | Elasticsearch        |
|----------------|---------------------|----------------------|
| Setup          | Single binary       | JVM + cluster config |
| Typo Tolerance | Built-in            | Requires analysis    |
| Vector Search  | Built-in (v1.3+)    | Requires plugin      |
| Resource Usage | ~50MB RAM           | 2-4GB RAM minimum   |
| Query Speed    | <50ms typical       | <100ms typical       |

**Decision**: Meilisearch's built-in typo tolerance and vector search make it perfect for a search app that "just works." Elasticsearch is overkill for this scale and its vector search setup is complex.

**Tradeoff**: Meilisearch lacks some advanced ES features (aggregations, complex nested queries). For a search-focused app, Meilisearch's simplicity wins.

---

## 6. JMAP vs IMAP (Email Protocol)

**Chose: JMAP (via Stalwart)**

| Factor         | JMAP                | IMAP                |
|----------------|---------------------|---------------------|
| Protocol       | JSON over HTTP      | Text-based TCP      |
| Batch Operations| ✅ Native          | ❌ Per-message       |
| Push           | Built-in            | Requires IDLE       |
| Modern         | RFC 8620 (2019)     | RFC 3501 (2003)     |
| Clients        | Few native          | Ubiquitous          |

**Decision**: JMAP represents the future of email protocols. Building with JMAP demonstrates awareness of modern standards and results in a cleaner API surface.

**Tradeoff**: Limited client library ecosystem. We implement our own JMAP client, which is actually a feature (shows protocol implementation skill).

---

## 7. Turborepo vs Nx (Monorepo Tooling)

**Chose: Turborepo**

| Factor         | Turborepo           | Nx                   |
|----------------|---------------------|----------------------|
| Configuration  | Minimal (turbo.json)| Extensive (nx.json)  |
| Learning Curve | Low                 | High                 |
| Caching        | Remote caching      | Remote caching       |
| Task Graph     | Automatic           | Explicit             |
| IDE Integration| Basic               | Full VS Code extension|

**Decision**: Turborepo's zero-config approach lets us focus on building apps rather than configuring tooling. For 6 apps + 4 packages, Turborepo handles the build graph well.

**Tradeoff**: Nx offers more powerful dependency graphing and affected-project detection. If the monorepo grows significantly, migration to Nx would be considered.

---

## 8. Tailwind CSS v4 vs CSS-in-JS (Styling)

**Chose: Tailwind CSS v4**

| Factor         | Tailwind v4         | CSS-in-JS (e.g., styled) |
|----------------|---------------------|---------------------------|
| Bundle Size    | Only used classes   | Runtime overhead          |
| Performance    | Compile-time        | Runtime injection         |
| DX             | Utility classes     | Template literals         |
| Dark Mode      | Built-in variant    | Manual theme context      |
| RSC Compatible | ✅                   | ⚠️ Requires configuration |

**Decision**: Tailwind v4's native dark mode variant (`dark:`), zero-runtime, and RSC compatibility make it ideal for a Next.js 15 monorepo.

**Tradeoff**: Long class names in JSX. We mitigate this with shared components in `@anvil/ui` that encapsulate common patterns.

---

## 9. Session Storage: Encrypted Cookies vs Server-Side Sessions

**Chose: Encrypted Cookies**

| Factor         | Cookies             | Server Sessions      |
|----------------|---------------------|----------------------|
| Infra          | No Redis needed     | Requires session store|
| Scalability    | Stateless           | Shared state needed  |
| Latency        | No DB lookup        | DB lookup per request|
| Revocation     | Harder              | Easy (delete from store)|

**Decision**: For a portfolio project with moderate traffic, encrypted cookies eliminate the need for a shared session store. The base64 encoding in our implementation is a simplification; production would use AES-GCM encryption.

**Tradeoff**: Cookie size limits (4KB) and harder session revocation. For production at scale, we'd switch to server-side sessions with Redis.
