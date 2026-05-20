/**
 * Docs API — Document CRUD routes (Fastify)
 */

import {FastifyInstance} from 'fastify';
import {db} from '../db/index.js';
import {documents} from '../db/schema.js';
import {eq, desc, like} from 'drizzle-orm';

export async function documentRoutes(app: FastifyInstance) {
  // List documents
  app.get('/api/documents', async (request, reply) => {
    const userId = (request.headers as Record<string, string>)['x-anvil-user-id'] ?? 'anonymous';

    const docs = await db
      .select({
        id: documents.id,
        title: documents.title,
        updatedAt: documents.updatedAt,
        collaborators: documents.collaborators,
        ownerId: documents.ownerId,
      })
      .from(documents)
      .where(eq(documents.ownerId, userId))
      .orderBy(desc(documents.updatedAt));

    return docs;
  });

  // Get single document
  app.get('/api/documents/:id', async (request, reply) => {
    const {id} = request.params as {id: string};

    const doc = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (!doc.length) {
      return reply.code(404).send({error: 'Document not found'});
    }

    return doc[0];
  });

  // Create document
  app.post('/api/documents', async (request, reply) => {
    const userId = (request.headers as Record<string, string>)['x-anvil-user-id'] ?? 'anonymous';
    const body = request.body as {title?: string} | undefined;

    const result = await db
      .insert(documents)
      .values({
        title: body?.title ?? 'Untitled Document',
        ownerId: userId,
        collaborators: [],
      })
      .returning();

    return reply.code(201).send(result[0]);
  });

  // Update document (auto-save)
  app.patch('/api/documents/:id', async (request, reply) => {
    const {id} = request.params as {id: string};
    const body = request.body as {
      title?: string;
      content?: string;
      ydocState?: string;
    };

    const result = await db
      .update(documents)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();

    if (!result.length) {
      return reply.code(404).send({error: 'Document not found'});
    }

    return result[0];
  });

  // Delete document
  app.delete('/api/documents/:id', async (request, reply) => {
    const {id} = request.params as {id: string};

    const result = await db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning();

    if (!result.length) {
      return reply.code(404).send({error: 'Document not found'});
    }

    return {success: true};
  });

  // Search documents
  app.get('/api/documents/search', async (request, reply) => {
    const {q} = request.query as {q?: string};
    const userId = (request.headers as Record<string, string>)['x-anvil-user-id'] ?? 'anonymous';

    if (!q) return [];

    const docs = await db
      .select({
        id: documents.id,
        title: documents.title,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(like(documents.title, `%${q}%`))
      .orderBy(desc(documents.updatedAt))
      .limit(20);

    return docs;
  });
}
