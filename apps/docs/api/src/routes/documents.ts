/**
 * Docs API — Document CRUD routes (Fastify)
 */

import {FastifyInstance} from 'fastify';
import {db} from '../db/index.js';
import {documents} from '../db/schema.js';
import {eq, desc, like} from 'drizzle-orm';

// ── Template definitions (shared with frontend) ──

interface DocumentTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  content: string;
}

const TEMPLATES: DocumentTemplate[] = [
  {
    id: 'meeting-notes',
    title: 'Meeting Notes',
    description: 'Structured template for capturing meeting discussions and action items',
    icon: '📋',
    category: 'business',
    content: `<h1>Meeting Notes</h1><p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p><h2>Attendees</h2><ul><li>Attendee 1</li><li>Attendee 2</li></ul><h2>Agenda</h2><ol><li>Topic 1</li><li>Topic 2</li></ol><h2>Discussion</h2><p>Key points...</p><h2>Action Items</h2><ul><li>☐ <strong>Owner:</strong> Action item — <em>Due: [date]</em></li></ul>`,
  },
  {
    id: 'project-proposal',
    title: 'Project Proposal',
    description: 'Comprehensive project proposal with objectives, timeline, and budget',
    icon: '🚀',
    category: 'business',
    content: `<h1>Project Proposal: [Name]</h1><h2>Executive Summary</h2><p>Overview of the project...</p><h2>Objectives</h2><ol><li>Objective 1</li><li>Objective 2</li></ol><h2>Timeline</h2><ul><li><strong>Phase 1:</strong> Planning</li><li><strong>Phase 2:</strong> Development</li></ul><h2>Budget</h2><p><strong>Total:</strong> $XX,XXX</p>`,
  },
  {
    id: 'weekly-status',
    title: 'Weekly Status Report',
    description: 'Track progress, blockers, and plans',
    icon: '📊',
    category: 'business',
    content: `<h1>Weekly Status Report</h1><h2>✅ Completed</h2><ul><li>Task 1</li><li>Task 2</li></ul><h2>🔄 In Progress</h2><ul><li>Task 3 — <em>50%</em></li></ul><h2>🚧 Blockers</h2><ul><li>Blocker 1</li></ul><h2>📅 Next Week</h2><ul><li>Planned task</li></ul>`,
  },
  {
    id: 'resume',
    title: 'Resume / CV',
    description: 'Clean, professional resume template',
    icon: '📄',
    category: 'personal',
    content: `<h1>[Your Name]</h1><p>[City] | [email] | [phone]</p><h2>Professional Summary</h2><p>2-3 sentences...</p><h2>Experience</h2><h3>Job Title — Company</h3><p><em>2020 – Present</em></p><ul><li>Achievement 1</li><li>Achievement 2</li></ul><h2>Education</h2><h3>Degree — University</h3><p><em>Year</em></p><h2>Skills</h2><ul><li><strong>Technical:</strong> Skill 1, Skill 2</li></ul>`,
  },
  {
    id: 'brainstorm',
    title: 'Brainstorm / Ideas',
    description: 'Free-form idea capture',
    icon: '💡',
    category: 'personal',
    content: `<h1>Brainstorm: [Topic]</h1><h2>Problem</h2><p>What are we solving?</p><h2>Ideas</h2><h3>💡 Idea 1</h3><ul><li>Description</li><li>Pros: ...</li><li>Cons: ...</li></ul><h2>Top Picks</h2><ol><li>Idea X</li></ol><h2>Next Steps</h2><ul><li>☐ Action item</li></ul>`,
  },
  {
    id: 'blog-post',
    title: 'Blog Post',
    description: 'Structured blog post with intro, body, conclusion',
    icon: '✍️',
    category: 'creative',
    content: `<h1>[Blog Title]</h1><p><em>By [Author] · 5 min read</em></p><h2>Introduction</h2><p>Hook the reader...</p><h2>Main Point 1</h2><p>Content...</p><h2>Main Point 2</h2><p>Content...</p><h2>Conclusion</h2><p>Wrap up with a strong closing.</p>`,
  },
];

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

  // ── Templates ──

  // List available templates
  app.get('/api/templates', async () => {
    return TEMPLATES.map(({id, title, description, icon, category}) => ({
      id, title, description, icon, category,
    }));
  });

  // Create document from template
  app.post<{Body: {templateId: string; title?: string}}>('/api/documents/from-template', async (request, reply) => {
    const userId = (request.headers as Record<string, string>)['x-anvil-user-id'] ?? 'anonymous';
    const {templateId, title} = request.body as {templateId: string; title?: string};

    const template = TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return reply.code(404).send({error: 'Template not found'});
    }

    // Process dynamic content
    const content = template.content
      .replace(/\$\{new Date\(\)\.toLocaleDateString\(\)\}/g, new Date().toLocaleDateString())
      .replace(/\$\{new Date\(\)\.toLocaleTimeString\(\)\}/g, new Date().toLocaleTimeString());

    const result = await db
      .insert(documents)
      .values({
        title: title ?? template.title,
        ownerId: userId,
        collaborators: [],
        content,
      })
      .returning();

    return reply.code(201).send(result[0]);
  });
}
