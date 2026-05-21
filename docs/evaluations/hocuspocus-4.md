# Hocuspocus 4 Migration Evaluation — Project Anvil

**Date:** 2026-05-21
**Status:** Evaluated → Recommended Migration
**Current version:** `@hocuspocus/server@^2.13.0`, `@hocuspocus/provider@^2.13.0`
**Target version:** `@hocuspocus/server@^4.0.0`, `@hocuspocus/provider@^4.0.0`

## What's New in Hocuspocus 4

### Cross-Runtime Support
- Uses `crossws` universal WebSocket adapter
- Runs on Node.js, Bun, Deno, and Cloudflare Workers
- `handleConnection()` accepts any `WebSocketLike` object + standard `Request`
- Enables edge deployment for Anvil's collaboration server

### Performance & Memory
- Improved memory management for large documents
- Optimized WebSocket handling (lower overhead per connection)
- Better garbage collection of disconnected clients

### API Changes
- Wire protocol: **backward compatible** (v3 client ↔ v4 server works)
- Stronger TypeScript generics on `Context`
- Structured/ordered transaction origins
- `onAwarenessUpdate` hook for fine-grained presence control
- Web-standard `Headers` API in hooks

### Requirements
- Node.js 22+
- SQLite persistence: switch from `sqlite3` to `better-sqlite3` (no data migration)
- WebSocket: `handleConnection` signature updated

## Migration Steps for Anvil

1. Update dependencies in `apps/docs/api/package.json` and `apps/docs/package.json`
2. Update `Hocuspocus` server construction in `apps/docs/api/src/server.ts`
3. Update `HocuspocusProvider` in `apps/docs/app/editor/[id]/page.tsx`
4. Wire protocol is backward compatible — no client changes needed for basic usage
5. Optional: Deploy collaboration server to Cloudflare Workers

## Risk Assessment
- **Low risk**: Wire protocol backward compatible
- **Medium effort**: Server hooks API has breaking changes
- **High reward**: Edge deployment, CF Workers, cross-runtime, better memory

## Decision: MIGRATE
Proceed with upgrade. Backward compatibility minimizes risk.
