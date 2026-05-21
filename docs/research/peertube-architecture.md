# PeerTube Architecture Study — Self-Hosted Video for YouTube Clone

**Date:** 2026-05-21
**Status:** Researched

---

## Executive Summary

PeerTube is a decentralized, federated video platform (AGPL-3.0) built on Node.js + PostgreSQL + Redis. Its architecture provides valuable patterns for Project Anvil's YouTube clone, particularly around video transcoding, adaptive streaming (HLS), federation (ActivityPub), and peer-to-peer delivery (WebTorrent).

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│                 PeerTube Instance            │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │  Express  │  │  FFmpeg  │  │   Redis   │ │
│  │  Server   │  │ Worker   │  │   Queue   │ │
│  └────┬─────┘  └────┬─────┘  └───────────┘ │
│       │              │                      │
│  ┌────▼──────────────▼──────────────────┐   │
│  │         PostgreSQL Database          │   │
│  │  (videos, accounts, channels, etc.)  │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │     Object Storage (S3 / filesystem) │   │
│  │  (video files, thumbnails, avatars)  │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
         │                    │
    ActivityPub          WebTorrent
   Federation           P2P Delivery
```

---

## Key Architecture Patterns

### 1. Video Processing Pipeline

```
Upload → Temporary Storage → FFmpeg Transcode → HLS Segments → Object Storage
                              ↓
                    - Multiple resolutions (360p, 480p, 720p, 1080p)
                    - Thumbnail generation
                    - Subtitle extraction
                    - WebTorrent metadata
```

**Lessons for Anvil:**
- Use a job queue (BullMQ / Redis) for transcoding — never block the request
- Generate HLS segments for adaptive bitrate streaming
- Store original + transcoded files in object storage (MinIO/R2)
- Extract thumbnails server-side with FFmpeg

### 2. Adaptive Streaming (HLS)

PeerTube uses HLS (HTTP Live Streaming) with multiple quality levels:
- Client requests `master.m3u8` playlist
- Server delivers quality-specific `.m3u8` sub-playlists
- Client switches quality based on bandwidth
- Segments cached at CDN edge

**Implementation for Anvil:**
```typescript
// After upload, generate HLS with FFmpeg:
// ffmpeg -i input.mp4 \
//   -filter_complex "[v]split=3[v1][v2][v3]" \
//   -map "[v1]" -map 0:a -c:v libx264 -b:v 800k   -s 640x360  -f hls -hls_time 6 -hls_playlist_type vod stream_360p.m3u8 \
//   -map "[v2]" -map 0:a -c:v libx264 -b:v 1500k  -s 854x480  -f hls -hls_time 6 -hls_playlist_type vod stream_480p.m3u8 \
//   -map "[v3]" -map 0:a -c:v libx264 -b:v 3000k  -s 1280x720 -f hls -hls_time 6 -hls_playlist_type vod stream_720p.m3u8
```

### 3. Federation (ActivityPub)

PeerTube implements ActivityPub for federation:
- Each instance is a "server actor"
- Videos are `Video` activities
- Likes, comments, shares are federated
- Follow/subscribe works cross-instance

**For Anvil:** Not needed for demo. ActivityPub federation is Phase 25+ territory.

### 4. P2P Delivery (WebTorrent)

PeerTube uses WebTorrent for peer-to-peer video delivery:
- Reduces server bandwidth by 30-50%
- Viewers share video segments with each other
- Falls back to regular HTTP if no peers available
- Uses WebRTC for browser-to-browser transfers

**For Anvil:** Consider for production but skip for demo. WebTorrent adds complexity without benefit for a single-user demo.

### 5. Search Engine Integration

PeerTube uses PostgreSQL full-text search with an optional Meilisearch plugin:
- PostgreSQL: `to_tsvector` + `to_tsquery` for basic search
- Meilisearch: typo-tolerant, faceted, ranked search
- Indexes video title, description, tags, channel name

**For Anvil:** Already using Meilisearch. Map PeerTube's indexing pattern to our existing search infrastructure.

---

## Database Schema Patterns

### Videos Table (simplified)
```sql
CREATE TABLE videos (
  id UUID PRIMARY KEY,
  uuid UUID UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER,          -- seconds
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  dislikes BIGINT DEFAULT 0,
  nsfw BOOLEAN DEFAULT FALSE,
  originally_published_at TIMESTAMP,
  published_at TIMESTAMP,
  channel_id UUID REFERENCES channels(id),
  category INTEGER,
  licence INTEGER,
  language TEXT,
  privacy SMALLINT,          -- 1=public, 2=unlisted, 3=private, 4=internal
  sensitivty TEXT,
  support TEXT,
  wait_transcoding BOOLEAN,
  state SMALLINT,            -- 0=published, 1=processing, 2=failed
  url TEXT UNIQUE,           -- ActivityPub URL
  aspect_ratio FLOAT,
  thumbnail_file TEXT,
  preview_file TEXT,
  hls_playlist_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX idx_videos_search ON videos USING gin(to_tsvector('english', name || ' ' || coalesce(description, '')));
```

### Channels + Accounts
```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  account_id UUID REFERENCES accounts(id),
  avatar_file TEXT,
  banner_file TEXT,
  support TEXT
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  avatar_file TEXT
);
```

---

## Recommended Architecture for Anvil YouTube Clone

```
Upload → Fastify API → MinIO (original)
                    → BullMQ Job Queue
                       → FFmpeg Worker
                          → HLS Segments → MinIO
                          → Thumbnail → MinIO
                          → Metadata → PostgreSQL
                       → Meilisearch Index
```

### Docker Compose Addition
```yaml
  ffmpeg-worker:
    build:
      context: .
      dockerfile: apps/youtube/Dockerfile.worker
    environment:
      MINIO_ENDPOINT: minio:9000
      POSTGRES_URL: postgres://anvil:secret@postgres:5432/anvil
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis
      - minio
      - postgres
    volumes:
      - video_temp:/tmp/transcode
```

---

## Key Takeaways for Anvil

| Pattern | PeerTube Approach | Anvil Implementation |
|---------|-------------------|---------------------|
| Video upload | Multipart to temp storage | MinIO direct upload |
| Transcoding | FFmpeg worker via job queue | BullMQ + FFmpeg worker |
| Streaming | HLS adaptive bitrate | HLS via MinIO/edge CDN |
| Thumbnails | FFmpeg frame extraction | FFmpeg `-ss 00:00:01 -frames:v 1` |
| Search | PostgreSQL FTS + Meilisearch | Meilisearch (already integrated) |
| P2P | WebTorrent | Skip for demo |
| Federation | ActivityPub | Skip for demo |
| Player | Video.js + WebTorrent | Video.js or HTML5 `<video>` with HLS.js |

---

## Files for Reference

| File | Purpose |
|------|---------|
| `docs/research/peertube-architecture.md` | This document |
