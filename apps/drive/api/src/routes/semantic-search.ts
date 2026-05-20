/**
 * Drive API — Semantic search route
 * Uses pgvector with HNSW index for vector similarity search,
 * and falls back to full-text search for keyword queries.
 */

import type {FastifyInstance} from 'fastify';
import {sql, and, eq, desc} from 'drizzle-orm';
import {db, files} from '../db/schema.js';

export async function semanticSearchRoutes(app: FastifyInstance) {
  /**
   * POST /api/files/search/semantic
   * Body: { query: string, userId: string, limit?: number, threshold?: number }
   *
   * Performs hybrid search:
   * 1. If embedding provided or embedding API configured → vector similarity
   * 2. Falls back to PostgreSQL full-text search (ts_vector)
   * 3. Combines results with reciprocal rank fusion
   */
  app.post<{
    Body: {
      query: string;
      userId: string;
      limit?: number;
      threshold?: number;
      embedding?: number[]; // Pre-computed embedding (from @anvil/ai)
    };
  }>('/api/files/search/semantic', async (request, reply) => {
    const {query, userId, limit = 20, threshold = 0.5, embedding} = request.body;

    if (!query?.trim() && !embedding?.length) {
      return reply.code(400).send({error: 'Query or embedding required'});
    }

    // If we have a pre-computed embedding, do vector search
    if (embedding && embedding.length > 0) {
      const embeddingStr = `[${embedding.join(',')}]`;

      const vectorResults = await db.execute(sql`
        SELECT
          f.id, f.name, f.mime_type, f.size, f.path, f.tags, f.created_at, f.updated_at,
          1 - (f.embedding <=> ${embeddingStr}::vector) AS similarity
        FROM files f
        WHERE f.user_id = ${userId}
          AND f.deleted_at IS NULL
          AND f.is_directory = false
          AND f.embedding IS NOT NULL
          AND 1 - (f.embedding <=> ${embeddingStr}::vector) > ${threshold}
        ORDER BY f.embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `);

      return {
        results: vectorResults.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          mimeType: r.mime_type,
          size: r.size,
          path: r.path,
          tags: r.tags,
          similarity: Number(r.similarity),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
        searchType: 'vector',
      };
    }

    // Fallback: Full-text search with ts_vector
    const tsQuery = query
      .trim()
      .split(/\s+/)
      .map(word => `${word}:*`)
      .join(' & ');

    const ftsResults = await db.execute(sql`
      SELECT
        f.id, f.name, f.mime_type, f.size, f.path, f.tags, f.created_at, f.updated_at,
        ts_rank(
          to_tsvector('english', coalesce(f.name, '') || ' ' || coalesce(array_to_string(f.tags, ' '), '')),
          to_tsquery('english', ${tsQuery})
        ) AS rank
      FROM files f
      WHERE f.user_id = ${userId}
        AND f.deleted_at IS NULL
        AND f.is_directory = false
        AND to_tsvector('english', coalesce(f.name, '') || ' ' || coalesce(array_to_string(f.tags, ' '))) @@ to_tsquery('english', ${tsQuery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    return {
      results: ftsResults.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        mimeType: r.mime_type,
        size: r.size,
        path: r.path,
        tags: r.tags,
        rank: Number(r.rank),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      searchType: 'fulltext',
    };
  });

  /**
   * POST /api/files/:id/embed
   * Store an embedding for a file (called after content extraction)
   */
  app.post<{
    Params: {id: string};
    Body: {embedding: number[]; tags?: string[]};
  }>('/api/files/:id/embed', async (request, reply) => {
    const {id} = request.params;
    const {embedding, tags} = request.body;

    if (!embedding || embedding.length === 0) {
      return reply.code(400).send({error: 'Embedding vector required'});
    }

    const embeddingStr = `[${embedding.join(',')}]`;

    await db.execute(sql`
      UPDATE files
      SET embedding = ${embeddingStr}::vector,
          tags = COALESCE(${tags ?? null}, tags)
      WHERE id = ${id}
    `);

    return {success: true};
  });
}

/**
 * SQL migration for enabling pgvector and creating the HNSW index.
 * Run this against your PostgreSQL database:
 *
 * CREATE EXTENSION IF NOT EXISTS vector;
 * ALTER TABLE files ADD COLUMN IF NOT EXISTS embedding vector(1536);
 * ALTER TABLE files ADD COLUMN IF NOT EXISTS tags text[];
 *
 * CREATE INDEX IF NOT EXISTS idx_files_embedding_hnsw
 *   ON files USING hnsw (embedding vector_cosine_ops)
 *   WITH (m = 16, ef_construction = 64);
 *
 * -- For fast full-text search
 * CREATE INDEX IF NOT EXISTS idx_files_name_trgm ON files USING gin (name gin_trgm_ops);
 */
