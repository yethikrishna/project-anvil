# TubeArchivist Video Metadata Search Study

**Date:** 2026-05-21
**Status:** Researched

---

## Executive Summary

TubeArchivist is a self-hosted YouTube archiving tool that uses Elasticsearch for powerful video metadata search. Its approach to indexing, searching, and organizing video content provides patterns applicable to Project Anvil's YouTube clone — particularly around multi-field search, subtitle/transcript indexing, and faceted navigation.

---

## TubeArchivist Architecture

```
YouTube API → Download → Elasticsearch Index
                         ├─ Video metadata (title, description, channel, tags)
                         ├─ Subtitles/Transcripts (full-text)
                         ├─ Comments
                         └─ Playlists + Channels

Search → Elasticsearch Query
         ├─ Full-text (title + description + transcript)
         ├─ Faceted (channel, category, duration, date)
         ├─ Aggregated (top channels, recent activity)
         └─ Highlighted (matching snippets)
```

---

## Key Patterns

### 1. Multi-Field Document Structure

```json
{
  "youtube_id": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "channel": {
    "name": "Rick Astley",
    "channel_id": "UCuAXFkgsw1L7xaCfnd5JJOw"
  },
  "description": "The official video...",
  "tags": ["music", "pop", "80s"],
  "category": ["Music"],
  "duration": 213,
  "published": "2009-10-25T06:57:54Z",
  "views": 1400000000,
  "likes": 15000000,
  "subtitles": [
    {
      "lang": "en",
      "source": "auto",
      "text": "We're no strangers to love..."
    }
  ],
  "comments": [
    { "text": "Still listening in 2026", "author": "user123" }
  ],
  "playlists": ["PLxyz..."],
  "file_size": 52428800,
  "media_size": 52428800,
  "download_date": "2026-05-01T12:00:00Z"
}
```

### 2. Search Query Patterns

```json
{
  "query": {
    "bool": {
      "should": [
        { "match": { "title": { "query": "react tutorial", "boost": 3.0 } } },
        { "match": { "description": { "query": "react tutorial", "boost": 1.5 } } },
        { "match": { "subtitles.text": { "query": "react tutorial", "boost": 1.0 } } },
        { "match": { "comments.text": { "query": "react tutorial", "boost": 0.5 } } }
      ],
      "filter": [
        { "range": { "duration": { "gte": 300, "lte": 3600 } } },
        { "term": { "channel.name": "Fireship" } }
      ]
    }
  },
  "highlight": {
    "fields": {
      "title": {},
      "description": {},
      "subtitles.text": { "fragment_size": 150, "number_of_fragments": 3 }
    }
  },
  "aggs": {
    "top_channels": { "terms": { "field": "channel.name", "size": 10 } },
    "duration_ranges": { "range": { "field": "duration", "ranges": [
      { "to": 300 },
      { "from": 300, "to": 1800 },
      { "from": 1800 }
    ]}}
  }
}
```

### 3. Transcript Search (Most Valuable Pattern)

TubeArchivist indexes full subtitle/transcript text, enabling:
- "Find the exact moment someone said X"
- Time-stamped search results
- Jump-to-position playback

**Implementation for Anvil:**

```typescript
// Meilisearch equivalent of transcript search
interface VideoDocument {
  id: string;
  title: string;
  description: string;
  channelName: string;
  tags: string[];
  duration: number;
  publishedAt: string;
  views: number;
  // Transcript segments for timestamp-based search
  transcript: string;        // Full text for search
  transcriptSegments: {
    start: number;           // Seconds
    end: number;
    text: string;
  }[];
}
```

---

## Meilisearch Adaptation

Since Anvil already uses Meilisearch (not Elasticsearch), here's how to adapt the patterns:

| Elasticsearch Feature | Meilisearch Equivalent |
|----------------------|----------------------|
| Multi-field match | `searchableAttributes` ranking |
| Boosting | `rankingRules` |
| Filters | `filterableAttributes` + filter expressions |
| Aggregations | `faceting` |
| Highlighting | `_formatted` in search response |
| Nested documents | Flatten to top-level fields |

### Meilisearch Index Configuration

```json
{
  "uid": "anvil_videos",
  "primaryKey": "id",
  "searchableAttributes": [
    "title",
    "description",
    "channelName",
    "tags",
    "transcript"
  ],
  "filterableAttributes": [
    "channelName",
    "tags",
    "duration",
    "publishedAt",
    "views",
    "category"
  ],
  "sortableAttributes": [
    "views",
    "publishedAt",
    "duration"
  ],
  "rankingRules": [
    "words",
    "typo",
    "proximity",
    "attribute",
    "sort",
    "exactness"
  ],
  "faceting": {
    "maxValuesPerFacet": 20
  }
}
```

---

## Recommended Implementation

### Video Search Service

```typescript
// apps/youtube/lib/video-search.ts
interface VideoSearchResult {
  id: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  duration: number;
  views: number;
  publishedAt: string;
  // Highlighted matches
  _formatted: {
    title: string;
    description: string;
  };
}

async function searchVideos(query: string, filters?: {
  channel?: string;
  minDuration?: number;
  maxDuration?: number;
  dateAfter?: string;
  sortBy?: 'relevance' | 'views' | 'date';
}): Promise<VideoSearchResult[]> {
  const filterParts: string[] = [];
  if (filters?.channel) filterParts.push(`channelName = "${filters.channel}"`);
  if (filters?.minDuration) filterParts.push(`duration >= ${filters.minDuration}`);
  if (filters?.maxDuration) filterParts.push(`duration <= ${filters.maxDuration}`);
  if (filters?.dateAfter) filterParts.push(`publishedAt >= "${filters.dateAfter}"`);

  return meili.index('anvil_videos').search(query, {
    filter: filterParts.length ? filterParts : undefined,
    sort: filters?.sortBy === 'views' ? ['views:desc'] :
          filters?.sortBy === 'date' ? ['publishedAt:desc'] : undefined,
    facets: ['channelName', 'tags', 'category'],
    attributesToHighlight: ['title', 'description'],
    limit: 20,
  });
}
```

---

## Key Takeaways

1. **Transcript search is the killer feature** — users search for what was *said*, not just titles
2. **Faceted navigation** (channel, duration, date) dramatically improves findability
3. **Multi-field boosting** (title > description > transcript > comments) for relevance
4. **Highlighting** shows *why* a result matched, not just that it did
5. **Meilisearch covers 90%** of what Elasticsearch provides for this use case — the remaining 10% (complex nested aggregations) isn't needed for a demo

---

## Files

| File | Purpose |
|------|---------|
| `docs/research/tubearchivist-search.md` | This document |
