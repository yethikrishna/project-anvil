**Anvil Photos**

Google Photos clone built with Next.js 15, TypeScript, and modern web APIs.

## Features

### Photo Management
- **Timeline view** — photos grouped by month/year with date headers
- **Grid view** — compact masonry-style grid
- **Map view** — geotagged photos on interactive Leaflet/OSM map
- **Infinite scroll** — IntersectionObserver-based pagination (50 photos/page)
- **Blur-up loading** — thumbnail → preview progressive enhancement

### Upload Pipeline
- **Drag-and-drop** anywhere on the page (global overlay)
- **Multi-file picker** with concurrent uploads (max 3 in parallel)
- **XHR progress tracking** per file with visual progress bar
- **Queue panel** — bottom-right upload status panel
- **Processing pipeline** on upload:
  - Sharp (Node) / ImageMagick fallback for image processing
  - Thumbnail generation: 400×400 WebP, center-crop
  - Preview generation: 1080px long edge WebP
  - pHash (perceptual hash) for duplicate detection
  - EXIF extraction (date, camera, GPS, exposure)
  - AI tag generation (time of day, camera brand, geo context)

### Organization
- **Albums** — manual albums, create from selection, add photos
- **Faces** — face cluster sidebar (name people)
- **Favourites** — star photos, filter by favourites
- **Archive** — separate archive view
- **Trash** — soft-delete with trash view

### Search
- Natural language search: `"beach photos"`, `"photos from March"`, `"iPhone photos"`
- Keyword matching: filename, description, tags, location, camera
- Date parsing: `"last year"`, `"June 2024"`, `"last summer"`
- Scene detection: beach, forest, city, night, food, portrait, wedding

### Photo Viewer (Lightbox)
- Keyboard navigation: `← →` navigate, `Esc` close, `F` favourite, `I` info panel
- Touch swipe gestures
- Zoom in/out controls
- EXIF info panel: date, camera, exposure, GPS, dimensions, file size
- Favourite, download, share actions
- Google Maps link for geotagged photos

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| State | Zustand 5 (subscribeWithSelector) |
| Database | PostgreSQL + Drizzle ORM |
| Storage | S3/MinIO (AWS SDK v3) |
| Image processing | Sharp / ImageMagick fallback |
| Map | Leaflet + OpenStreetMap |
| EXIF parsing | exifr |

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/photos` | List photos (paginated, filtered) |
| GET | `/api/photos/[id]` | Single photo with signed URLs |
| PATCH | `/api/photos/[id]` | Update photo (favourite, tags) |
| DELETE | `/api/photos/[id]` | Soft-delete |
| PATCH | `/api/photos/batch` | Bulk archive/favourite |
| DELETE | `/api/photos/batch` | Bulk delete |
| POST | `/api/upload` | Upload + process photo |
| GET | `/api/albums` | List albums |
| POST | `/api/albums` | Create album |
| DELETE | `/api/albums/[id]` | Delete album |
| POST | `/api/albums/[id]/photos` | Add photos to album |
| POST | `/api/albums/[id]/share` | Generate share link |
| GET | `/api/faces` | List face clusters |
| PATCH | `/api/faces/[id]` | Name a person |
| GET | `/api/search` | Natural language photo search |
| GET | `/api/stats` | Storage stats, top tags, locations |

## Schema

- **photos** — full metadata, EXIF, geo, AI tags, pHash, storage keys
- **albums** — manual and auto-created albums
- **album_photos** — M:N junction with sort order
- **face_clusters** — grouped face embeddings (one per person)
- **photo_faces** — face detections with bounding boxes + embeddings
- **photo_duplicates** — pHash-based duplicate pairs

## Duplicate Detection

Photos within Hamming distance ≤ 10 on the 64-bit pHash are flagged as duplicates. The 8×8 DCT-based pHash is computed server-side during upload, tolerating:
- JPEG re-encoding
- Minor crops
- Slight brightness/contrast adjustments

## Dev

```bash
cd apps/photos
pnpm dev       # → http://localhost:3011
pnpm build
pnpm start
```

Environment variables:
```
DATABASE_URL=postgresql://anvil:anvil@localhost:5432/anvil_photos
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=anvil
S3_SECRET_KEY=anvil_secret
PHOTOS_BUCKET=anvil-photos
NEXT_PUBLIC_APP_URL=http://localhost:3011
```
