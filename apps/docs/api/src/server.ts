/**
 * Docs API — Hocuspocus WebSocket backend + Fastify REST server
 *
 * Serves:
 * - Hocuspocus WebSocket on /hocuspocus for real-time Yjs sync
 * - REST API on /api/documents for CRUD + auto-save
 * - Health check on /health
 */

import 'dotenv/config';
import {Hocuspocus} from '@hocuspocus/server';
import {Doc as YDoc} from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import {documentRoutes} from './routes/documents.js';
import {exportRoutes} from './routes/export.js';
import {previewRoutes} from './routes/preview.js';
import {analyticsRoutes} from './routes/analytics-routes.js';
import {db} from './db/index.js';
import {documents} from './db/schema.js';
import {eq} from 'drizzle-orm';

const PORT = parseInt(process.env.PORT ?? '3102');
const HOST = process.env.HOST ?? '0.0.0.0';

// ── Hocuspocus Server ──

const hocuspocus = new Hocuspocus({
  port: PORT + 1, // WebSocket on separate port
  address: HOST,

  async onConnect({documentName, context}) {
    // Auth check could go here
    return {
      user: {
        id: context?.userId ?? 'anonymous',
        name: context?.userName ?? 'Anonymous',
        color: getRandomColor(),
      },
    };
  },

  async onLoadDocument({documentName, document}) {
    // Load persisted document state from PostgreSQL
    try {
      const docId = documentName.replace('doc-', '');
      const rows = await db
        .select({ydocState: documents.ydocState})
        .from(documents)
        .where(eq(documents.id, docId))
        .limit(1);

      if (rows.length && rows[0].ydocState) {
        const state = Buffer.from(rows[0].ydocState, 'base64');
        YDoc.prototype.transact.bind(document)({}, () => {
          // Apply stored state
          const ydoc = new YDoc();
          YDoc.prototype.applyUpdate.bind(ydoc)(state);
        });
      }
    } catch (err) {
      console.error('Failed to load document:', err);
    }
  },

  async onStoreDocument({documentName, document, context}) {
    // Auto-save: persist Yjs document state to PostgreSQL
    try {
      const docId = documentName.replace('doc-', '');
      const state = Buffer.from(YDoc.prototype.encodeStateAsUpdate.bind(document)()).toString('base64');

      // Also get HTML content for searchability
      const content = getHTMLContent(document);

      await db
        .update(documents)
        .set({
          ydocState: state,
          content,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, docId));
    } catch (err) {
      console.error('Failed to store document:', err);
    }
  },

  // Debounce auto-saves to avoid hammering the DB
  debounce: 2000,
  maxDebounce: 10000,
});

// ── Helper: Extract HTML from Yjs doc ──

function getHTMLContent(document: YDoc): string {
  try {
    // Tiptap stores content as ProseMirror JSON in the 'default' fragment
    // For now, return a placeholder — in production, use @hocuspocus/transformer
    return '';
  } catch {
    return '';
  }
}

// ── Helper: Random user color ──

const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635',
  '#34d399', '#22d3ee', '#818cf8', '#c084fc',
  '#f472b6', '#94a3b8',
];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// ── Fastify REST Server ──

async function main() {
  const app = Fastify({logger: {level: process.env.LOG_LEVEL ?? 'info'}});

  await app.register(cors, {origin: true, credentials: true});
  await app.register(websocket);

  // Health
  app.get('/health', async () => ({status: 'ok', service: 'docs-api'}));

  // Document CRUD
  await app.register(documentRoutes);

  // Document export (PDF / DOCX)
  await app.register(exportRoutes);

  // Document preview (static rendering)
  await app.register(previewRoutes);

  // Collaboration analytics
  await app.register(analyticsRoutes);

  // Proxy WebSocket connections to Hocuspocus
  app.get('/hocuspocus', {websocket: true}, (socket, request) => {
    // Forward WebSocket to Hocuspocus
    const url = new URL(request.url ?? '/', `ws://${HOST}:${PORT + 1}`);
    const ws = new (await import('ws')).default(
      `ws://${HOST}:${PORT + 1}${url.pathname}${url.search}`
    );

    ws.on('message', (data) => socket.send(data));
    socket.on('message', (data) => ws.send(data));
    ws.on('close', () => socket.close());
    socket.on('close', () => ws.close());
  });

  await app.listen({port: PORT, host: HOST});
  console.log(`🚀 Docs API running at http://${HOST}:${PORT}`);
  console.log(`🔌 Hocuspocus WS running at ws://${HOST}:${PORT + 1}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
