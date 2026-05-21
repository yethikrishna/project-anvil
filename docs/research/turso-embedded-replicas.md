# Turso Embedded Replicas Evaluation — Offline Drive/Docs

**Date:** 2026-05-21
**Status:** Evaluated
**Verdict:** Best option for edge-deployed offline-first apps

---

## What is Turso?

Turso is a distributed SQLite database built on libSQL (a SQLite fork). Key features:
- Embedded replicas: full SQLite database in the browser (WASM) or mobile app
- Automatic sync with remote primary
- Microsecond reads (local SQLite)
- Edge-optimized replication

---

## Architecture

```
Browser (WASM SQLite)                    Turso Platform
┌──────────────────┐                    ┌──────────────────┐
│ libSQL WASM       │◄──── HTTP ────────►│ Turso Primary     │
│ (embedded replica)│   (replication)    │ (edge SQLite)     │
│ (read in ~μs)     │                    │ (write forwarding)│
└──────────────────┘                    └──────────────────┘
```

---

## vs PowerSync

| Feature | Turso | PowerSync |
|---------|-------|-----------|
| Local DB | libSQL (WASM/native) | SQLite |
| Remote DB | Turso (libSQL) | PostgreSQL |
| Sync | Embedded replica (automatic) | Custom sync rules |
| Offline writes | Yes (forwarded on reconnect) | Yes (with conflict resolution) |
| Edge deployment | Built-in | Requires PowerSync service |
| Free tier | 9GB storage, 500 databases | Limited |
| Setup complexity | Low (single service) | Medium (service + PostgreSQL) |
| PostgreSQL compatibility | No (libSQL/SQLite) | Yes |

---

## Evaluation for Anvil

| Factor | Rating | Notes |
|--------|--------|-------|
| Offline reads | ⭐⭐⭐⭐⭐ | Embedded replica in WASM |
| Offline writes | ⭐⭐⭐⭐ | Forwarded on reconnect |
| Latency | ⭐⭐⭐⭐⭐ | Microsecond local reads |
| Setup | ⭐⭐⭐⭐ | Simpler than PowerSync |
| Cost | ⭐⭐⭐⭐⭐ | Generous free tier |
| PostgreSQL need | ⭐⭐ | Requires libSQL migration |
| Demo value | ⭐⭐⭐ | Shows offline capability |

---

## Recommendation

**For demo:** Turso is the better choice over PowerSync because:
1. Simpler setup (no PostgreSQL replication config)
2. WASM SQLite in browser = instant offline
3. Free tier is generous
4. Works with Cloudflare Workers (D1 is Turso-compatible)

**For production:** If PostgreSQL is mandatory, use PowerSync. If edge/offline is priority, use Turso.

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/turso-embedded-replicas.md` | This document |
