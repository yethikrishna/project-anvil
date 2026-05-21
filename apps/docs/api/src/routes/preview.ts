/**
 * Docs API — Document preview route using @tiptap/static-renderer
 *
 * Renders Tiptap document content as static HTML, plain text,
 * or structured JSON for use in previews, search indexing, and sharing.
 */

import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateHTML } from '@tiptap/static-renderer';
import StarterKit from '@tiptap/starter-kit';
import { jsonToHtml, htmlToJson } from '../lib/tiptap-renderer.js';

export async function previewRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/documents/:id/preview
   * Returns a static HTML preview of the document.
   * Query params:
   *   - format: 'html' (default) | 'text' | 'json'
   *   - excerpt: number of characters for text excerpt (default: full)
   */
  app.get('/api/documents/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { format?: string; excerpt?: string };

    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (!doc) {
      return reply.code(404).send({ error: 'Document not found' });
    }

    const content = doc.content ?? '';
    const format = query.format ?? 'html';

    switch (format) {
      case 'text': {
        // Strip HTML tags for plain text preview
        const text = content
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();

        if (query.excerpt) {
          const len = parseInt(query.excerpt) || 200;
          return {
            title: doc.title,
            excerpt: text.slice(0, len) + (text.length > len ? '...' : ''),
            wordCount: text.split(/\s+/).filter(Boolean).length,
            updatedAt: doc.updatedAt,
          };
        }

        return {
          title: doc.title,
          text,
          wordCount: text.split(/\s+/).filter(Boolean).length,
          updatedAt: doc.updatedAt,
        };
      }

      case 'json': {
        // Return structured JSON representation
        return {
          title: doc.title,
          content: htmlToJson(content),
          updatedAt: doc.updatedAt,
        };
      }

      case 'html':
      default: {
        // Return rendered static HTML with a wrapper for preview display
        const html = jsonToHtml(content);
        return {
          title: doc.title,
          html,
          updatedAt: doc.updatedAt,
        };
      }
    }
  });

  /**
   * GET /api/documents/:id/meta
   * Returns lightweight document metadata (no content).
   */
  app.get('/api/documents/:id/meta', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [doc] = await db
      .select({
        id: documents.id,
        title: documents.title,
        ownerId: documents.ownerId,
        collaborators: documents.collaborators,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (!doc) {
      return reply.code(404).send({ error: 'Document not found' });
    }

    return doc;
  });
}
