/**
 * Analytics API routes — Real-time collaboration metrics
 */

import {FastifyInstance} from 'fastify';
import {
  recordJoin,
  recordLeave,
  recordEdit,
  getDocumentAnalytics,
  getGlobalAnalytics,
} from './analytics.js';

export async function analyticsRoutes(app: FastifyInstance) {
  // Record a user joining a document session
  app.post<{
    Body: {documentId: string; userId: string; userName: string; color: string};
  }>('/api/analytics/join', async (request, reply) => {
    const {documentId, userId, userName, color} = request.body;
    recordJoin(documentId, userId, userName, color);
    return {success: true};
  });

  // Record a user leaving a document session
  app.post<{
    Body: {documentId: string; userId: string};
  }>('/api/analytics/leave', async (request, reply) => {
    const {documentId, userId} = request.body;
    recordLeave(documentId, userId);
    return {success: true};
  });

  // Record an edit event
  app.post<{
    Body: {documentId: string; userId: string};
  }>('/api/analytics/edit', async (request, reply) => {
    const {documentId, userId} = request.body;
    recordEdit(documentId, userId);
    return {success: true};
  });

  // Get analytics for a specific document
  app.get<{
    Params: {id: string};
  }>('/api/documents/:id/analytics', async (request, reply) => {
    const {id} = request.params;
    const analytics = getDocumentAnalytics(id);

    if (!analytics) {
      return reply.code(404).send({error: 'No analytics data for this document'});
    }

    return analytics;
  });

  // Get global analytics across all documents
  app.get('/api/analytics/global', async () => {
    return getGlobalAnalytics();
  });
}
