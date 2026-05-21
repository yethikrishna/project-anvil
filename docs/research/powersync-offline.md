# PowerSync Evaluation — Offline-First Drive/Docs

**Date:** 2026-05-21
**Status:** Evaluated
**Verdict:** Excellent for production, overkill for demo

---

## What is PowerSync?

PowerSync is a sync engine that keeps a local SQLite database in sync with a remote PostgreSQL database. It provides:
- Automatic conflict resolution (CRDT-like)
- Offline-first architecture (read/write locally, sync when online)
- Real-time sync via logical replication
- TypeScript SDK for React Native, Flutter, Web (WASM)

---

## Architecture

```
Client (SQLite)                          Server (PostgreSQL)
┌──────────────────┐                    ┌──────────────────┐
│ PowerSync SQLite  │◄──── WebSocket ───►│ PowerSync Service │
│ (local reads/     │   (change stream)  │ (reads WAL,       │
│  writes in <1ms)  │                    │  resolves conflicts│
└──────────────────┘                    └──────────────────┘
```

---

## Evaluation for Anvil

| Factor | Rating | Notes |
|--------|--------|-------|
| Offline capability | ⭐⭐⭐⭐⭐ | Full read/write offline |
| Conflict resolution | ⭐⭐⭐⭐⭐ | Automatic, configurable |
| Sync reliability | ⭐⭐⭐⭐ | Proven in production apps |
| Latency | ⭐⭐⭐⭐⭐ | Local reads <1ms |
| Complexity | ⭐⭐ | Requires PowerSync service + PostgreSQL replication |
| Cost | ⭐⭐ | Free tier available, paid for production |
| Demo suitability | ⭐⭐ | Adds significant infrastructure complexity |

---

## Recommendation

**For demo:** Skip. Use PWA Service Workers for offline caching (read-only). The demo doesn't need offline write capability.

**For production:** Strong candidate. PowerSync + SQLite gives the best offline experience for Drive and Docs apps. Evaluate against Turso embedded replicas (see separate evaluation).

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/powersync-offline.md` | This document |
