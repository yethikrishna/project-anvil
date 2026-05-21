/**
 * Drive API — File routes
 * Upload, list, download, rename, delete, share
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, desc, asc, sql, like } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, files, shareLinks } from '../db/schema.js';
import { uploadFile, getDownloadUrl, deleteFile as deleteS3File } from '../storage.js';
import { AppError } from '../middleware/errors.js';

/**
 * Convert a human path like "/photos/vacation" into an ltree path like
 * "root.photos.vacation". Root is always "root".
 */
function toLtree(path: string): string {
  const cleaned = path.replace(/\/+/g, '.').replace(/^\.+|\.+$/g, '');
  return cleaned ? `root.${cleaned}` : 'root';
}

/**
 * Get the parent ltree path for a given path
 */
function parentLtree(path: string): string {
  const parts = path.split('.');
  if (parts.length <= 1) return 'root';
  return parts.slice(0, -1).join('.');
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // ── Upload file ──────────────────────────────────────
  app.post('/files/upload', async (request, reply) => {
    const userId = request.userId;
    const data = await request.file();
    if (!data) {
      throw new AppError(400, 'MISSING_FILE', 'No file uploaded');
    }

    const buffer = await data.toBuffer();
    const parentPath = (request.query as any).path ?? '/';
    const ltreePath = `${toLtree(parentPath)}.${data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const s3Key = `drive/${userId}/${uuidv4()}/${data.filename}`;

    // Upload to S3
    await uploadFile(s3Key, buffer, data.mimetype);

    // Insert metadata into DB
    const [entry] = await db.insert(files).values({
      userId,
      name: data.filename,
      path: sql`${ltreePath}::ltree`,
      mimeType: data.mimetype,
      size: buffer.length,
      s3Key,
      isDirectory: false,
    }).returning();

    reply.code(201).send({ data: entry });
  });

  // ── List files ───────────────────────────────────────
  app.get('/files', async (request) => {
    const userId = request.userId;
    const query = request.query as {
      path?: string;
      page?: string;
      pageSize?: string;
      sortBy?: string;
      sortOrder?: string;
    };

    const dirPath = toLtree(query.path ?? '/');
    const page = Math.max(1, parseInt(query.page ?? '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '50')));
    const offset = (page - 1) * pageSize;

    // Find files whose parent path matches (children of the directory)
    const parentPath = dirPath;

    const conditions = and(
      eq(files.userId, userId),
      sql`path ~ ${parentPath}::lquery`,
      sql`nlevel(path) = nlevel(${parentPath}::ltree) + 1`,
      sql`deleted_at IS NULL`
    );

    const items = await db
      .select()
      .from(files)
      .where(conditions)
      .limit(pageSize)
      .offset(offset)
      .orderBy(asc(files.name));

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(conditions);

    return {
      data: items,
      total: Number(count),
      page,
      pageSize,
    };
  });

  // ── Get file by ID ───────────────────────────────────
  app.get('/files/:id', async (request) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };

    const [entry] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, userId), sql`deleted_at IS NULL`))
      .limit(1);

    if (!entry) {
      throw new AppError(404, 'NOT_FOUND', 'File not found');
    }

    return { data: entry };
  });

  // ── Download file (presigned URL) ────────────────────
  app.get('/files/:id/download', async (request) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };

    const [entry] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, userId), sql`deleted_at IS NULL`))
      .limit(1);

    if (!entry || entry.isDirectory || !entry.s3Key) {
      throw new AppError(404, 'NOT_FOUND', 'File not found or is a directory');
    }

    const url = await getDownloadUrl(entry.s3Key);
    return { data: { url, name: entry.name, mimeType: entry.mimeType } };
  });

  // ── Create folder ────────────────────────────────────
  app.post('/files/folder', async (request, reply) => {
    const userId = request.userId;
    const body = request.body as { name: string; parentPath: string };

    if (!body.name) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Folder name is required');
    }

    const parentLtreePath = toLtree(body.parentPath ?? '/');
    const ltreePath = `${parentLtreePath}.${body.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const [entry] = await db.insert(files).values({
      userId,
      name: body.name,
      path: sql`${ltreePath}::ltree`,
      isDirectory: true,
      size: 0,
    }).returning();

    reply.code(201).send({ data: entry });
  });

  // ── Rename file/folder ───────────────────────────────
  app.patch('/files/:id/rename', async (request) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };
    const body = request.body as { name: string };

    if (!body.name) {
      throw new AppError(400, 'VALIDATION_ERROR', 'New name is required');
    }

    const [existing] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, userId), sql`deleted_at IS NULL`))
      .limit(1);

    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'File not found');
    }

    // Build new ltree path with the new name
    const oldPath = existing.path;
    const parentPath = parentLtree(oldPath);
    const newPath = `${parentPath}.${body.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    // Update this file and all children paths
    await db.execute(sql`
      UPDATE files
      SET name = ${body.name},
          path = ${sql`replace(path::text, ${oldPath}, ${newPath})::ltree`},
          updated_at = NOW()
      WHERE user_id = ${userId}
        AND path <@ ${oldPath}::ltree
        AND deleted_at IS NULL
    `);

    const [updated] = await db
      .select()
      .from(files)
      .where(eq(files.id, id))
      .limit(1);

    return { data: updated };
  });

  // ── Soft-delete file/folder ──────────────────────────
  app.delete('/files/:id', async (request) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, userId), sql`deleted_at IS NULL`))
      .limit(1);

    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'File not found');
    }

    // Soft-delete the file and all children
    await db.execute(sql`
      UPDATE files
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = ${userId}
        AND path <@ ${existing.path}::ltree
        AND deleted_at IS NULL
    `);

    // Delete from S3 (only the direct file, not recursively for now)
    if (existing.s3Key) {
      await deleteS3File(existing.s3Key).catch(() => {});
    }

    return { data: { deleted: true } };
  });

  // ── Create share link ────────────────────────────────
  app.post('/files/:id/share', async (request) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };
    const body = request.body as { expiresInHours?: number };

    const [existing] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, userId), sql`deleted_at IS NULL`))
      .limit(1);

    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'File not found');
    }

    const token = uuidv4().replace(/-/g, '');
    const expiresAt = body.expiresInHours
      ? new Date(Date.now() + body.expiresInHours * 3600_000)
      : null;

    const [link] = await db.insert(shareLinks).values({
      fileId: id,
      token,
      createdBy: userId,
      expiresAt,
    }).returning();

    return { data: link };
  });

  // ── Sync file (upsert: update existing file content) ──
  app.post('/files/sync', async (request, reply) => {
    const userId = request.userId;
    const query = request.query as { fileId?: string; path?: string };
    const data = await request.file();
    if (!data) {
      throw new AppError(400, 'MISSING_FILE', 'No file uploaded');
    }

    const buffer = await data.toBuffer();
    const drivePath = query.path ?? '/';

    // If fileId is provided, update the existing file
    if (query.fileId) {
      const [existing] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, query.fileId), eq(files.userId, userId), sql`deleted_at IS NULL`))
        .limit(1);

      if (!existing) {
        throw new AppError(404, 'NOT_FOUND', 'File not found for sync');
      }

      // Upload new version to S3 (new key to avoid cache issues)
      const s3Key = `drive/${userId}/${uuidv4()}/${data.filename}`;
      await uploadFile(s3Key, buffer, data.mimetype);

      // Delete old S3 object
      if (existing.s3Key) {
        await deleteS3File(existing.s3Key).catch(() => {});
      }

      // Update DB record
      const [updated] = await db
        .update(files)
        .set({
          size: buffer.length,
          mimeType: data.mimetype,
          s3Key,
          updatedAt: new Date(),
        })
        .where(eq(files.id, query.fileId))
        .returning();

      return { data: updated };
    }

    // No fileId — create a new file (same as upload)
    const ltreePath = `${toLtree(drivePath)}.${data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const s3Key = `drive/${userId}/${uuidv4()}/${data.filename}`;

    await uploadFile(s3Key, buffer, data.mimetype);

    const [entry] = await db.insert(files).values({
      userId,
      name: data.filename,
      path: sql`${ltreePath}::ltree`,
      mimeType: data.mimetype,
      size: buffer.length,
      s3Key,
      isDirectory: false,
    }).returning();

    reply.code(201).send({ data: entry });
  });

  // ── Access shared file (public, no auth required) ────
  app.get('/share/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const [link] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.token, token))
      .limit(1);

    if (!link) {
      throw new AppError(404, 'NOT_FOUND', 'Share link not found');
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new AppError(410, 'LINK_EXPIRED', 'Share link has expired');
    }

    const [entry] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, link.fileId), sql`deleted_at IS NULL`))
      .limit(1);

    if (!entry) {
      throw new AppError(404, 'NOT_FOUND', 'Shared file not found');
    }

    // If it's a file, return a presigned download URL
    if (!entry.isDirectory && entry.s3Key) {
      const url = await getDownloadUrl(entry.s3Key);
      return { data: { ...entry, downloadUrl: url } };
    }

    return { data: entry };
  });
}
