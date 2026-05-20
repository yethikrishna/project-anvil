/**
 * Drive API — Database layer (PostgreSQL + ltree)
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pgTable, uuid, text, bigint, boolean, timestamp, ltree, index } from 'drizzle-orm/pg-core';

// ── Connection ────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL ?? 'postgresql://anvil:anvil_secret@localhost:5432/drive_db';

const queryClient = postgres(connectionString);
export const db = drizzle(queryClient);

// ── Schema ────────────────────────────────────────────────

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  path: ltree('path').notNull(),
  mimeType: text('mime_type'),
  size: bigint('size', { mode: 'number' }).default(0),
  s3Key: text('s3_key'),
  isDirectory: boolean('is_directory').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_files_path').using('gist', table.path),
  index('idx_files_user').on(table.userId),
]);

export const shareLinks = pgTable('share_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id').notNull(),
  token: text('token').notNull().unique(),
  createdBy: uuid('created_by').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Types ─────────────────────────────────────────────────

export type FileEntry = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
