# MapLibre v6 Migration Plan

**Date:** 2026-05-21
**Status:** Evaluation
**Priority:** Phase 11

## Summary

MapLibre GL JS v6 introduces ESM-only distribution, WebGL2 renderer, and improved terrain support.
This affects the Maps clone app which currently uses MapLibre v5.

## Key Changes in MapLibre v6

### 1. ESM-Only Distribution
- No more CommonJS build — pure ESM
- `import` statements only; no `require()`
- Better tree-shaking, smaller bundles
- **Impact:** `next.config.ts` already transpiles `maplibre-gl`, minimal change needed

### 2. WebGL2 Renderer (Default)
- WebGL2 is now the default rendering backend
- Fallback to WebGL1 for older browsers
- Improved rendering performance and features
- **Impact:** No code changes needed — automatic upgrade

### 3. 3D Terrain Improvements
- Better DEM (Digital Elevation Model) rendering
- Improved hillshading and exaggeration controls
- Sky layer enhancements
- **Impact:** Maps app can offer terrain view with better quality

### 4. Improved Globe Projection
- Seamless 2D ↔ 3D globe transitions
- Better handling of poles and antimeridian
- **Impact:** Google Earth-like experience possible

### 5. Performance Improvements
- 20-30% faster tile rendering
- Reduced memory usage for large datasets
- Better GeoJSON handling for large files
- **Impact:** All map views benefit, especially data-heavy layers

### 6. New Style Spec Features
- ` expression` enhancements
- Variable bindings in style expressions
- **Impact:** More complex styling without workarounds

## Migration Steps

### Phase 1: Dependency Update
```bash
pnpm add maplibre-gl@^6.0.0 --filter @anvil/maps
```

### Phase 2: Import Updates
MapLibre v6 exports are ESM-only:
```ts
// Before (v5, CommonJS-compatible)
import maplibregl from 'maplibre-gl';

// After (v6, ESM)
import {Map, NavigationControl, GeolocateControl} from 'maplibre-gl';
```

### Phase 3: Feature Integration
1. Enable terrain view with DEM tiles
2. Add globe projection option
3. Leverage WebGL2 for custom layers
4. Update style expressions to use new variable bindings

### Phase 4: Testing
- Test all map views (street, satellite, terrain)
- Test marker/cluster rendering
- Test route overlay rendering
- Test geocoding result display
- Verify WebGL2 fallback on older browsers

## Risk Assessment
- **Low Risk:** Basic map rendering (MapLibre has strong backward compat)
- **Medium Risk:** Custom WebGL layers (API may differ)
- **Low Risk:** Style spec (backward compatible, additive changes)

## Timeline: 1-2 days
