# MapLibre v6 Migration Plan

**Date:** 2026-05-21
**Status:** Planned (waiting for stable release)

---

## Key Changes in MapLibre v6

### 1. WebGL 2 Only
- Drops WebGL 1 support (97%+ browsers support WebGL 2)
- Better performance, more GPU features
- Tile rendering 2-3× faster

### 2. ESM-Only
- No more CommonJS build
- Tree-shaking works properly
- Smaller bundle size (~30% reduction)

### 3. New Style Specification Features
- `fill-extrusion` improvements
- Better expression system
- Sky/atmosphere rendering

### 4. TypeScript Rewrite
- Full TypeScript types (no more @types/maplibre-gl)
- Better IDE support
- Stricter API

---

## Migration Impact

```typescript
// Before (MapLibre v5)
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// After (MapLibre v6)
import { Map, NavigationControl, GeolocateControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
```

### Breaking Changes
- `map.on('load')` → `map.on('style.load')`
- Some style spec changes
- Removed deprecated APIs

---

## Recommendation

Wait for MapLibre v6 stable. Current v5 works fine. Migration is low-risk (mostly import changes).

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/maplibre-v6-migration.md` | This document |
