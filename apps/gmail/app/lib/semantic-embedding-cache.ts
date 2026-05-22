/**
 * Semantic Email Search — Embedding Cache
 *
 * Production-grade embedding cache for semantic email search.
 * Uses IndexedDB for persistent client-side storage with LRU eviction.
 *
 * Features:
 * - Persistent embedding cache across sessions
 * - LRU eviction when cache exceeds size limit
 * - Batch embedding computation
 * - Cosine similarity search
 * - Fallback to keyword search when offline
 */

// ── Types ──

export interface CachedEmbedding {
  id: string;            // email ID
  embedding: number[];   // normalized embedding vector
  text: string;          // original text (first 500 chars)
  timestamp: number;     // when cached
  accessCount: number;   // for LRU
  lastAccessed: number;  // for LRU
}

export interface SearchResult {
  id: string;
  score: number;
  text: string;
}

// ── Config ──

const DB_NAME = 'anvil-semantic-cache';
const DB_VERSION = 1;
const STORE_NAME = 'embeddings';
const MAX_CACHE_SIZE = 5000;
const EMBEDDING_DIMENSION = 384; // MiniLM-L6-v2 size

// ── IndexedDB Access ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {keyPath: 'id'});
        store.createIndex('lastAccessed', 'lastAccessed', {unique: false});
        store.createIndex('timestamp', 'timestamp', {unique: false});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllFromStore(): Promise<CachedEmbedding[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putToStore(item: CachedEmbedding): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteFromStore(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getStoreCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── LRU Eviction ──

async function evictIfNeeded(): Promise<void> {
  const count = await getStoreCount();
  if (count < MAX_CACHE_SIZE) return;

  const all = await getAllFromStore();
  // Sort by last accessed (oldest first) and remove bottom 10%
  const toRemove = all
    .sort((a, b) => a.lastAccessed - b.lastAccessed)
    .slice(0, Math.ceil(MAX_CACHE_SIZE * 0.1));

  await Promise.all(toRemove.map(item => deleteFromStore(item.id)));
}

// ── Embedding Computation ──

async function computeEmbedding(text: string): Promise<number[]> {
  // Try server-side embedding first
  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'semantic-search',
        payload: {mode: 'embed', text},
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.embedding && Array.isArray(data.embedding)) {
        return normalizeVector(data.embedding);
      }
    }
  } catch {
    // Fall through to local computation
  }

  // Local fallback: simple TF-based pseudo-embedding
  return computeLocalEmbedding(text);
}

function computeLocalEmbedding(text: string): number[] {
  // Simple hash-based pseudo-embedding for offline use
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const embedding = new Array(EMBEDDING_DIMENSION).fill(0);

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % EMBEDDING_DIMENSION;
    embedding[idx] += 1;

    // Bigram contribution
    if (word.length > 3) {
      const idx2 = Math.abs(hash >> 8) % EMBEDDING_DIMENSION;
      embedding[idx2] += 0.5;
    }
  }

  return normalizeVector(embedding);
}

function normalizeVector(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (mag === 0) return vec;
  return vec.map(v => v / mag);
}

// ── Cosine Similarity ──

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // Already normalized
}

// ── Public API ──

/**
 * Get or compute embedding for an email.
 * Uses cache when available, computes and caches otherwise.
 */
export async function getEmailEmbedding(
  emailId: string,
  text: string,
): Promise<number[]> {
  // Check cache
  const all = await getAllFromStore();
  const cached = all.find(e => e.id === emailId);

  if (cached) {
    // Update access stats
    cached.accessCount++;
    cached.lastAccessed = Date.now();
    await putToStore(cached);
    return cached.embedding;
  }

  // Compute and cache
  const embedding = await computeEmbedding(text.slice(0, 500));
  const entry: CachedEmbedding = {
    id: emailId,
    embedding,
    text: text.slice(0, 500),
    timestamp: Date.now(),
    accessCount: 1,
    lastAccessed: Date.now(),
  };

  await evictIfNeeded();
  await putToStore(entry);
  return embedding;
}

/**
 * Batch compute embeddings for multiple emails.
 * Efficient: checks cache first, only computes missing ones.
 */
export async function batchGetEmbeddings(
  emails: Array<{id: string; text: string}>,
): Promise<Map<string, number[]>> {
  const all = await getAllFromStore();
  const cacheMap = new Map(all.map(e => [e.id, e]));
  const results = new Map<string, number[]>();
  const toCompute: Array<{id: string; text: string}> = [];

  // Check cache
  for (const email of emails) {
    const cached = cacheMap.get(email.id);
    if (cached) {
      results.set(email.id, cached.embedding);
      // Update access
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      putToStore(cached); // fire and forget
    } else {
      toCompute.push(email);
    }
  }

  // Compute missing
  if (toCompute.length > 0) {
    // Batch: try server-side first
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'semantic-search',
          payload: {
            mode: 'embed-batch',
            texts: toCompute.map(e => ({id: e.id, text: e.text.slice(0, 500)})),
          },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.embeddings && Array.isArray(data.embeddings)) {
          for (let i = 0; i < data.embeddings.length && i < toCompute.length; i++) {
            const embedding = normalizeVector(data.embeddings[i]);
            results.set(toCompute[i].id, embedding);

            // Cache
            const entry: CachedEmbedding = {
              id: toCompute[i].id,
              embedding,
              text: toCompute[i].text.slice(0, 500),
              timestamp: Date.now(),
              accessCount: 1,
              lastAccessed: Date.now(),
            };
            putToStore(entry); // fire and forget
          }

          await evictIfNeeded();
          return results;
        }
      }
    } catch {
      // Fall through to local computation
    }

    // Local fallback
    for (const email of toCompute) {
      const embedding = computeLocalEmbedding(email.text);
      results.set(email.id, embedding);

      const entry: CachedEmbedding = {
        id: email.id,
        embedding,
        text: email.text.slice(0, 500),
        timestamp: Date.now(),
        accessCount: 1,
        lastAccessed: Date.now(),
      };
      putToStore(entry);
    }

    await evictIfNeeded();
  }

  return results;
}

/**
 * Semantic search over cached email embeddings.
 */
export async function semanticSearchCached(
  query: string,
  topK: number = 10,
  minScore: number = 0.3,
): Promise<SearchResult[]> {
  const queryEmbedding = await computeEmbedding(query);
  const all = await getAllFromStore();

  const scored: SearchResult[] = all.map(item => ({
    id: item.id,
    score: cosineSimilarity(queryEmbedding, item.embedding),
    text: item.text,
  }));

  return scored
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Clear the embedding cache.
 */
export async function clearEmbeddingCache(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get cache statistics.
 */
export async function getCacheStats(): Promise<{
  size: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  avgAccessCount: number;
}> {
  const all = await getAllFromStore();
  if (all.length === 0) {
    return {size: 0, oldestEntry: null, newestEntry: null, avgAccessCount: 0};
  }

  const timestamps = all.map(e => e.timestamp);
  return {
    size: all.length,
    oldestEntry: Math.min(...timestamps),
    newestEntry: Math.max(...timestamps),
    avgAccessCount: all.reduce((s, e) => s + e.accessCount, 0) / all.length,
  };
}
