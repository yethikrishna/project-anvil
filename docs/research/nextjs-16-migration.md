# Next.js 15 → 16 Migration Plan

**Date:** 2026-05-21
**Status:** Planned (Next.js 16 not yet stable)

---

## Next.js 16 Key Changes

### 1. Turbopack Default
- Turbopack replaces Webpack as the default bundler
- 10× faster cold starts, 5× faster HMR
- `next.config.ts` → `turbo: {}` config section

### 2. React "use cache" Directive
- Server Components can use `"use cache"` for automatic caching
- Replaces `revalidate` / `cookies()` patterns
- Cache entries tagged for fine-grained invalidation

```typescript
// Next.js 16 caching
async function getUser(id: string) {
  "use cache";
  // Automatically cached, invalidated by tags
  cacheTag(`user-${id}`);
  cacheLife("hours");
  return db.user.findUnique({ where: { id } });
}
```

### 3. Async Params
- `params` in page/layout components are now async (Promise-based)

```typescript
// Before (Next.js 15)
export default function Page({ params }: { params: { id: string } }) {
  return <div>{params.id}</div>;
}

// After (Next.js 16)
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div>{id}</div>;
}
```

### 4. React Compiler
- Automatic memoization of components and values
- Reduces unnecessary re-renders without manual `useMemo`/`useCallback`
- Opt-in via `reactCompiler: true` in next.config

### 5. Improved Static Generation
- PPR (Partial Prerendering) stable
- Combine static shell with dynamic streaming content
- Better ISR with streaming

---

## Migration Steps

### Step 1: Update next.config.ts

```typescript
// next.config.ts
const nextConfig = {
  // Enable Turbopack (default in v16)
  turbo: {
    rules: {
      '*.svg': { loaders: ['@svgr/webpack'], as: '*.js' },
    },
  },

  // Enable React Compiler
  reactCompiler: true,

  // Enable experimental features
  experimental: {
    ppr: 'incremental', // Partial Prerendering
    useCache: true,     // "use cache" directive
  },
};

export default nextConfig;
```

### Step 2: Fix Async Params

This affects every page with dynamic routes across all apps:

```bash
# Find all files using params
grep -rn "params:" apps/*/app/**/page.tsx apps/*/app/**/layout.tsx | grep -v "Promise"
```

Apps affected:
- `apps/gmail/app/page.tsx` — no dynamic routes
- `apps/drive/app/page.tsx` — no dynamic routes
- `apps/docs/app/[id]/page.tsx` — **needs fix**
- `apps/youtube/app/video/[id]/page.tsx` — **needs fix**
- `apps/maps/app/page.tsx` — no dynamic routes

### Step 3: Migrate to "use cache"

Replace `fetch` cache patterns:

```typescript
// Before
const res = await fetch(url, { next: { revalidate: 3600 } });

// After
async function getData() {
  "use cache";
  cacheLife("hours");
  const res = await fetch(url);
  return res.json();
}
```

### Step 4: Remove Manual Memoization

React Compiler handles this automatically:
- Remove `useMemo` calls that cache computations
- Remove `useCallback` for event handlers
- Remove `React.memo()` wrappers
- Keep `useMemo` for expensive calculations with side effects

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Turbopack incompatibilities | Medium | Test each app incrementally |
| React Compiler bugs | Low | Can disable per-component |
| Async params breaking changes | Medium | Grep + fix all occurrences |
| Third-party lib incompatibilities | High | Check each dep for v16 support |

---

## Timeline

- **Phase 1:** Update configs, fix async params (1 day)
- **Phase 2:** Enable React Compiler, remove manual memoization (1 day)
- **Phase 3:** Adopt "use cache" directive (2 days)
- **Phase 4:** Enable PPR for performance-critical pages (1 day)

---

## Recommendation

**Wait for Next.js 16 stable release.** Current Next.js 15 setup works fine for demo. When v16 releases:

1. Create a migration branch
2. Fix async params first (breaking change)
3. Enable Turbopack and test all apps
4. Opt-in to React Compiler incrementally
5. Adopt "use cache" for data fetching

---

## Files

| File | Purpose |
|------|---------|
| `docs/research/nextjs-16-migration.md` | This document |
