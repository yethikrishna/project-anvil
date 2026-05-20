# Project Anvil — System Design

Detailed data flow and design decisions for each application.

## 1. Drive — File Storage & Sharing

### Data Model
```
files (
  id          UUID PK,
  user_id     UUID NOT NULL,
  parent_id   UUID NULL REFERENCES files(id),
  name        VARCHAR(255) NOT NULL,
  path        VARCHAR(1024) NOT NULL,  -- materialized path: /root/folder/file
  mime_type   VARCHAR(128),
  size        BIGINT DEFAULT 0,
  s3_key      VARCHAR(512),            -- MinIO/S3 object key
  is_dir      BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
)

shares (
  id          UUID PK,
  file_id     UUID NOT NULL REFERENCES files(id),
  token       VARCHAR(64) UNIQUE NOT NULL,  -- share link token
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
)
```

### API Endpoints
| Method | Path           | Description                    |
|--------|----------------|--------------------------------|
| GET    | /files         | List files at path             |
| POST   | /files/upload  | Multipart upload               |
| GET    | /files/:id     | Get file metadata              |
| DELETE | /files/:id     | Delete file/directory          |
| PUT    | /files/:id     | Rename/move file               |
| POST   | /files/mkdir   | Create directory               |
| POST   | /shares        | Create share link              |
| GET    | /shares/:token | Access shared file             |

### Upload Strategy
- Multipart streaming: file chunks streamed directly to MinIO
- No temp file on API server — zero disk footprint
- Pre-signed URLs for direct browser-to-S3 upload (planned)
- Max file size: 512 MB per file

---

## 2. Docs — Collaborative Rich Text Editor

### Data Model
```
documents (
  id            UUID PK,
  title         VARCHAR(255) NOT NULL,
  owner_id      UUID NOT NULL,
  yjs_doc       BYTEA,                    -- persisted Yjs document state
  last_modified TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
)

document_collaborators (
  document_id   UUID REFERENCES documents(id),
  user_id       UUID NOT NULL,
  role          VARCHAR(16) DEFAULT 'editor',  -- owner, editor, viewer
  PRIMARY KEY (document_id, user_id)
)
```

### CRDT Sync Protocol
1. **Initial load**: Client fetches stored Yjs state from PostgreSQL
2. **Connection**: WebSocket to Hocuspocus server on `ws://localhost:3200`
3. **Sync**: Client sends local changes as Yjs updates
4. **Broadcast**: Hocuspocus broadcasts to all connected peers
5. **Persistence**: Hocuspocus `onStoreDocument` hook saves to DB (debounced 2s)

### Editor Extensions
- StarterKit (bold, italic, headings, lists, code blocks)
- Collaboration (Yjs binding)
- CollaborationCursor (user presence)
- Image, Link, Underline, TextAlign, Highlight, Typography, Placeholder

---

## 3. YouTube — Video Discovery & Playback

### Architecture
- **No backend API server** — uses browser-based API calls
- RapidAPI YouTube Search endpoint for search
- `react-player` for universal video playback
- Redux Toolkit for search result caching and rate limit tracking

### State Management
```typescript
interface VideoState {
  query: string;
  results: VideoResult[];
  suggestions: string[];
  loading: boolean;
  error: string | null;
  rateLimitRemaining: number;
  playlists: Playlist[];
}
```

### Rate Limiting
- Redux middleware tracks `X-RateLimit-Remaining` headers
- When < 5 remaining: disable autocomplete, show warning
- When 0: queue requests until reset time

---

## 4. Maps — Vector Map Rendering & Navigation

### Data Flow
1. **Map tiles**: MapLibre GL renders OpenMapTiles vector tiles via WebGL
2. **Geocoding**: Nominatim API for forward/reverse geocoding
3. **Routing**: OSRM (Open Source Routing Machine) for turn-by-turn
4. **User location**: `navigator.geolocation` via `useGeolocation` hook

### Key Components
- `MapContainer` — MapLibre GL instance with style configuration
- `SearchOverlay` — Nominatim search with result markers
- `RoutePanel` — OSRM route display with step-by-step directions
- `LocationOverlay` — User GPS position with accuracy circle
- `MobileSheet` — Vaul-based slide-up panel for mobile

### Marker Clustering
- `supercluster` for POI area clustering
- Zoom-based: cluster at low zoom, individual markers at high zoom
- Click cluster → zoom to bounds

---

## 5. Search — Hybrid Search Engine

### Hybrid Search Architecture
```
Query → ┬─ Meilisearch BM25 (lexical) ─┐
        │                                │→ Merge & Rank → Results
        └─ MiniLM Vector (semantic) ────┘
```

### Meilisearch Configuration
- Custom ranking rules: words, typo, proximity, attribute, sort, exactness
- Filterable attributes: domain, date, category
- Typo tolerance: enabled with minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 }
- Pagination: max 1000 results per query

### Semantic Search
- `all-MiniLM-L6-v2` transformer for query embedding (384-dim vectors)
- Vectors stored in Meilisearch `_vectors` field
- Hybrid ranking: 60% BM25 + 40% vector similarity (tunable)

---

## 6. Gmail — Email Client

### Architecture
- **Stalwart Mail Server**: SMTP (25/587) + IMAP + JMAP
- **JMAP (RFC 8620)**: Modern email protocol, JSON-based
- **RocksDB + PostgreSQL**: Dual persistence for mail storage

### Data Flow
1. Stalwart receives email → stores in RocksDB
2. Client connects via JMAP session endpoint
3. `Email/query` for inbox listing with pagination
4. `Email/get` for full message content
5. `Email/set` for compose, reply, forward
6. `Mailbox/set` for folder/label management

### Compose Flow
- Tiptap rich text editor in modal
- Draft auto-save via `Email/set` with `isDraft: true`
- Send: `Email/set` → Stalwart → SMTP relay

---

## 7. Notifications — Real-time Alert System

### Architecture
- Fastify WebSocket server on port 4020
- In-memory notification store (swap for PostgreSQL in production)
- User-scoped WebSocket channels

### Message Protocol
```typescript
// Server → Client
{ event: 'initial', payload: Notification[] }
{ event: 'notification', payload: Notification }
{ event: 'notification_read', payload: { ids: string[] } }

// Client connects with: ws://localhost:4020/ws?userId=xxx
```

### Notification Types
| Type        | Trigger                          | UI Treatment       |
|-------------|----------------------------------|--------------------|
| mail        | New email received               | Blue toast, badge  |
| file_share  | File/folder shared with user     | Green toast        |
| doc_mention | User mentioned in a document     | Purple toast       |
| comment     | Comment on shared document       | Yellow toast       |
| system      | System announcement              | Gray toast         |
