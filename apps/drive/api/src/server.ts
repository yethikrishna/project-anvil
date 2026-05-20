/**
 * Drive API — Fastify server entry point
 *
 * Serves the Drive REST API on port 3100 with:
 * - Multipart file upload → MinIO S3
 * - PostgreSQL file listing with ltree
 * - Presigned S3 download URLs
 * - Folder CRUD
 * - Share link generation
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { authMiddleware, optionalAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { fileRoutes } from './routes/files.js';
import { healthRoutes } from './routes/health.js';
import { ensureBucket } from './storage.js';

const PORT = parseInt(process.env.PORT ?? '3100');
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // ── Plugins ───────────────────────────────────────────

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB
      files: 10,
    },
  });

  // ── Global hooks ──────────────────────────────────────

  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for health and public share endpoints
    if (
      request.url === '/health' ||
      request.url.startsWith('/share/')
    ) {
      return;
    }
    await authMiddleware(request, reply);
  });

  app.setErrorHandler(errorHandler);

  // ── Routes ────────────────────────────────────────────

  await app.register(healthRoutes);
  await app.register(fileRoutes);

  // ── Startup ───────────────────────────────────────────

  await ensureBucket();

  await app.listen({ port: PORT, host: HOST });
  console.log(`🚀 Drive API running at http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
