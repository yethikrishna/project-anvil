# Project Anvil — Roadmap

## Completed Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Infrastructure Foundation | ✅ Done |
| 2 | SSO & Auth Layer | ✅ Done |
| 3 | Google Drive Clone | ✅ Done |
| 4 | Google Docs Clone | ✅ Done |
| 5 | YouTube Clone | ✅ Done |
| 6 | Google Maps Clone | ✅ Done |
| 7 | Google Search Clone | ✅ Done |
| 8 | Gmail Clone | ✅ Done |
| 9 | Cross-Cutting Features | ✅ Done |

## Phase Next: Modernization & AI Integration

**Target: Q2–Q3 2026**

### Priority 1: Editor Modernization
Upgrade Docs Clone to Tiptap 3 + Hocuspocus 4 for better performance, SSR, and DX.

- Tiptap 2 → 3 migration (Static Renderer, JSX support, now-OSS pro features)
- Hocuspocus 4 for collaboration server
- Server-side document preview rendering

### Priority 2: AI-Enhanced Search
Transform Search Clone into an intelligent, conversational search platform.

- Meilisearch 1.16+ upgrade with multi-modal embeddings
- Conversational Search / Chats API for document Q&A
- Reranking pipeline for hybrid search
- Multi-modal image+text search

### Priority 3: Local-First AI
Add optional privacy-first AI features that run entirely on-device.

- Local embedding generation (Nomic/BGE-M3 via Ollama)
- On-device document summarization
- WebGPU-powered client-side ML
- Local RAG pipeline for private document search

### Priority 4: Security Hardening
Audit and upgrade auth layer to RFC 9700 (OAuth 2.0 Security BCP, Jan 2025).

- DPoP sender-constrained tokens
- CSP Level 2+ on auth endpoints
- Exact redirect URI matching
- PAR evaluation for high-security flows

### Priority 5: Framework Upgrades
Keep the stack current with latest stable releases.

- Next.js 15 → 16 (Turbopack, React Compiler)
- React 19.1 features
- MapLibre v6 (ESM-only, WebGL2-only)

### Priority 6: UI & Deployment Polish

- View Transitions API for smooth cross-app navigation
- Edge function deployment for latency-sensitive APIs
- Supply chain security (SBOMs, automated auditing, OIDC CI/CD)
- Production monitoring and observability

## Long-Term Vision

Project Anvil aims to be a **fully self-hosted, AI-augmented productivity suite** that demonstrates modern web development practices at every layer:

- **Privacy-first**: Local AI mode means zero data leaves the user's infrastructure
- **Real-time**: CRDT-based collaboration across documents and communication
- **Intelligent**: Search that understands semantics, not just keywords
- **Modern**: Latest web platform APIs for performance and UX
- **Secure**: Follows current IETF best practices for OAuth/OIDC

---

*Last updated: 2026-05-21 (Trend Checker)*
*See [docs/trends/2026-05-21.md](docs/trends/2026-05-21.md) for full trend analysis*
