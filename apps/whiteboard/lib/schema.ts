/**
 * Whiteboard schema — stores boards with Excalidraw JSON state.
 */

import {
  pgTable, text, integer, boolean, timestamp, jsonb, index,
} from 'drizzle-orm/pg-core';

export const boards = pgTable('boards', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('Untitled'),
  /** Serialized Excalidraw elements + appState */
  elements: jsonb('elements').default([]),
  appState: jsonb('app_state').default({}),
  /** Collaboration: list of user IDs who can edit */
  collaborators: jsonb('collaborators').$type<string[]>().default([]),
  /** Public share token */
  shareToken: text('share_token'),
  isPublic: boolean('is_public').default(false),
  /** Template type: blank | wireframe | mindmap | flowchart | retro */
  template: text('template').default('blank'),
  thumbnail: text('thumbnail'), // base64 PNG
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('boards_user_id_idx').on(t.userId),
  index('boards_share_token_idx').on(t.shareToken),
]);

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
