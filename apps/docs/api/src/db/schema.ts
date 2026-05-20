/**
 * Docs API — Database schema for documents
 *
 * Stores document metadata in PostgreSQL. The actual collaborative
 * content lives in Yjs documents managed by Hocuspocus, and is
 * periodically persisted here for durability.
 */

import {pgTable, uuid, text, timestamp, integer, jsonb} from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull().default('Untitled Document'),
  content: text('content'), // HTML snapshot for search/display
  ydocState: text('ydoc_state'), // Base64-encoded Yjs document state
  ownerId: text('owner_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  version: integer('version').default(1).notNull(),
  collaborators: jsonb('collaborators').default([]).notNull(), // [{id, name, color}]
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
