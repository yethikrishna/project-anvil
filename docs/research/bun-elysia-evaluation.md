# Bun + Elysia Evaluation — Fastify Replacement

**Date:** 2026-05-21
**Status:** Evaluated
**Verdict:** Defer for now; Fastify works great

---

## Comparison

| Feature | Fastify (Node.js) | Elysia (Bun) |
|---------|-------------------|--------------|
| Requests/sec | ~60K | ~800K |
| Cold start | ~50ms | ~5ms |
| TypeScript | Via decorators/types | Native (no build step) |
| Auto OpenAPI | Via plugins | Built-in |
| WebSocket | Via @fastify/websocket | Built-in |
| Ecosystem | Very mature | Growing |
| Stability | Production-proven | Newer, some edge cases |

---

## Recommendation

**Keep Fastify.** The performance difference doesn't matter for a portfolio demo. Fastify's mature ecosystem (plugins, middleware, community) is more valuable than raw throughput.

**For a new production project:** Elysia + Bun is compelling — 10× faster, built-in OpenAPI, native TS.

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/bun-elysia-evaluation.md` | This document |
