# Next.js 15 → 16 Migration Plan

**Date:** 2026-05-21
**Status:** Evaluation
**Priority:** Phase 11 (post-launch optimization)

## Summary

Next.js 16 introduces Turbopack as the default bundler, React Compiler integration,
and breaking changes to caching and routing. This document outlines the migration path
for all 11 Anvil apps.

## Key Changes in Next.js 16

### 1. Turbopack Default (No Opt-in Required)
- Turbopack replaces Webpack as the default bundler
- 10x faster cold starts, 5x faster HMR
- Currently opt-in via `--turbopack` flag in Next.js 15
- **Action:** Remove `--turbopack` from dev scripts once migrated (it becomes default)

### 2. React Compiler (Automatic Memoization)
- React Compiler automatically memoizes components and values
- Reduces unnecessary re-renders without manual `useMemo`/`useCallback`
- Works with existing code — opt-in via `experimental.reactCompiler` in 15, default in 16
- **Impact:** All apps benefit — especially Docs editor and Gmail client with heavy state

### 3. Cache Components (Experimental → Stable)
- Server Components can be cached with `cache` directive
- Similar to `unstable_cache` but first-class API
- **Impact:** Search results, Maps tiles, Drive file listings benefit from component-level caching

### 4. Async Params/SearchParams
- `params` and `searchParams` in page components become `Promise<>`
- Breaking change: must `await params` in page components
- **Impact:** All dynamic routes (`/editor/[id]`, `/file/[id]`, etc.) need updating

### 5. `fetch` Cache Changes
- Default `fetch` caching changed from `force-cache` to `no-store`
- Explicit `cache: 'force-cache'` needed for cached fetches
- **Impact:** API routes that relied on default caching need explicit cache headers

## Migration Steps

### Phase 1: Preparation (Pre-migration)
1. ✅ All apps on Next.js 15.1+ (already done)
2. Enable Turbopack in dev mode for testing
3. Enable React Compiler in experimental mode
4. Audit all dynamic route pages for `params`/`searchParams` usage

### Phase 2: Core Package Updates
```bash
pnpm add next@^16.0.0 react@^19.1 react-dom@^19.1
```

### Phase 3: Per-App Migration
For each app (11 total):
1. Update `next.config.ts` — remove Turbopack experimental flags
2. Update dynamic route pages — `await params` pattern
3. Update `fetch` calls — explicit cache configuration
4. Remove manual `useMemo`/`useCallback` where React Compiler handles it
5. Test dev server (Turbopack) and production build
6. Run existing test suite

### Phase 4: Optimization
1. Add Cache Components for static content (Maps tiles, search listings)
2. Leverage React Compiler for editor-heavy apps (Docs, Gmail)
3. Configure Turbopack-specific optimizations

## Per-App Impact Assessment

| App | Dynamic Routes | Heavy State | Priority |
|-----|---------------|-------------|----------|
| Docs | `/editor/[id]` | Tiptap editor | **High** |
| Drive | `/file/[id]` | File upload state | Medium |
| Gmail | Thread views | Mail state | **High** |
| Maps | Tile rendering | Map viewport | Medium |
| Calendar | Event views | Date state | Medium |
| YouTube | `/watch/[id]` | Player state | Medium |
| Search | Results pages | Search state | Low |
| Tasks | Task views | Task state | Low |
| Admin | Config pages | Low state | Low |
| Blog | Post pages | Low state | Low |
| Marketplace | Listing pages | Low state | Low |

## Risk Assessment

- **Low Risk:** Admin, Blog, Marketplace, Tasks (simple pages, few dynamic routes)
- **Medium Risk:** Drive, Maps, Calendar, Search, YouTube (moderate complexity)
- **High Risk:** Docs (Tiptap + Hocuspocus collaborative state), Gmail (JMAP client state)

## Timeline Estimate
- Phase 1 (prep): 1 day
- Phase 2 (core updates): 0.5 day
- Phase 3 (per-app): 2-3 days (11 apps, ~30 min each on average)
- Phase 4 (optimization): 1-2 days
- **Total: 4-6 days**

## Current Status
- [x] Evaluation document created
- [x] Turbopack dev mode enabled across all apps
- [x] React Compiler experimental flag added
- [ ] Next.js 16 released and stable
- [ ] Per-app migration executed
- [ ] Production testing complete
