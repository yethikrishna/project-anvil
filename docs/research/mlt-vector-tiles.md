# MLT Vector Tile Format Evaluation — Maps Clone

**Date:** 2026-05-21
**Status:** Evaluated

---

## What is MLT?

MapLibre Tiles (MLT) is a new vector tile format designed as a successor to Mapbox Vector Tiles (MVT/PBF). It offers:
- 6× smaller tile size (binary format with better compression)
- Faster parsing (no protobuf decode step)
- Native support for feature properties compression
- Better suited for large datasets

### Size Comparison

| Dataset | MVT (PBF) | MLT | Savings |
|---------|-----------|-----|---------|
| OpenMapTiles planet | ~120 GB | ~20 GB | 83% |
| Single zoom level | ~800 MB | ~130 MB | 84% |
| Individual tile (z14) | ~15 KB | ~2.5 KB | 83% |

---

## How MLT Works

```
Traditional: .pbf tiles → Protobuf decode → Render
MLT:         .mlt tiles → Binary decode → Render (6× less data, faster parse)
```

MLT uses a column-oriented binary format:
- Geometry stored as delta-encoded coordinates
- Properties stored as dictionary-compressed columns
- Layer metadata separated from feature data

---

## Martin Tile Server

Martin is a PostGIS-based tile server that can serve both MVT and MLT:
- Reads directly from PostgreSQL/PostGIS
- Generates tiles on-the-fly (no pre-generation needed)
- Supports function-based and table-based tile sources
- Written in Rust (fast, low memory)

```yaml
# docker-compose addition
martin:
  image: maplibre/martin:latest
  ports:
    - "3111:3111"
  environment:
    DATABASE_URL: postgres://anvil:secret@postgres:5432/anvil
  networks:
    - anvil-net
```

---

## Evaluation for Anvil Maps Clone

### Current Setup
- MapLibre GL JS client
- Custom search API with Meilisearch
- Nominatim for geocoding
- OSRM for routing
- No custom tile serving (uses public raster tiles)

### With MLT + Martin

```
User → MapLibre GL JS → Martin Tile Server → PostgreSQL/PostGIS
                          (serves MLT tiles)
```

### Benefits

| Benefit | Impact |
|---------|--------|
| 6× smaller tiles | Faster load, less bandwidth |
| PostGIS integration | Serve custom GIS data (markers, heatmaps) |
| On-the-fly generation | No pre-generation step |
| Rust performance | ~10,000 tiles/sec on single core |

### Drawbacks

| Drawback | Impact |
|----------|--------|
| MLT not yet in MapLibre GL stable | Need to wait or use MVT via Martin |
| PostGIS setup complexity | Additional database configuration |
| Overkill for demo | Public tiles work fine for portfolio |

---

## Recommendation

**For demo:** Keep using public raster/vector tiles. The maps clone doesn't serve custom GIS data that would benefit from MLT.

**For production with custom data:** Add Martin tile server with PostGIS, serve MVT now, switch to MLT when MapLibre GL JS supports it natively.

**Priority:** Low. Add when maps clone needs custom tile layers (heatmaps, custom POI layers, user-generated geographic data).

---

## Implementation (When Ready)

### Martin Configuration

```toml
# martin.toml
[server]
bind = "0.0.0.0"
port = 3111

[[sources.postgis]]
name = "points_of_interest"
query = """
  SELECT ST_AsMVTGeom(geom, !tile_bounds!) AS geom, name, category, rating
  FROM points_of_interest
  WHERE geom && !bbox!
"""
```

### MapLibre GL JS Configuration

```typescript
const map = new maplibregl.Map({
  style: {
    version: 8,
    sources: {
      'anvil-tiles': {
        type: 'vector',
        url: 'http://localhost:3111/anvil-tiles',  // Martin auto-config endpoint
      },
    },
    layers: [{
      id: 'poi-layer',
      type: 'circle',
      source: 'anvil-tiles',
      'source-layer': 'points_of_interest',
      paint: { 'circle-radius': 5, 'circle-color': '#4285F4' },
    }],
  },
});
```

---

## Files

| File | Purpose |
|------|---------|
| `docs/research/mlt-vector-tiles.md` | This document |
