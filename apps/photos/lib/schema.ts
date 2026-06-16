/**
 * Database schema for Anvil Photos.
 *
 * Tables:
 * - photos          — photo metadata, EXIF, geo, AI tags
 * - albums          — user-created and auto-created albums
 * - album_photos    — M:N junction
 * - faces           — detected face embeddings
 * - face_clusters   — grouped faces (one person)
 * - photo_faces     — M:N junction photo ↔ face_cluster
 * - photo_duplicates — perceptual hash pairs
 */

import {
  pgTable, text, integer, real, boolean, timestamp, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

// ── Photos ──

export const photos = pgTable('photos', {
  id: text('id').primaryKey(), // UUID
  userId: text('user_id').notNull(),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),

  // Storage
  storageKey: text('storage_key').notNull(), // S3/MinIO object key
  thumbnailKey: text('thumbnail_key'),       // 400×400 WebP thumb
  previewKey: text('preview_key'),           // 1080px preview

  // EXIF metadata
  takenAt: timestamp('taken_at'),            // EXIF DateTimeOriginal
  camera: text('camera'),                    // EXIF Make + Model
  focalLength: real('focal_length'),
  aperture: real('aperture'),
  iso: integer('iso'),
  shutterSpeed: text('shutter_speed'),

  // Geo
  lat: real('lat'),
  lng: real('lng'),
  locationName: text('location_name'),       // reverse geocoded

  // AI / ML
  aiTags: jsonb('ai_tags').$type<string[]>().default([]),
  description: text('description'),          // AI caption
  sceneType: text('scene_type'),             // beach, forest, city…
  pHash: text('p_hash'),                     // 64-bit perceptual hash (hex)
  embedding: text('embedding'),              // CLIP embedding (base64)

  // Status
  isFavourite: boolean('is_favourite').default(false),
  isArchived: boolean('is_archived').default(false),
  isDeleted: boolean('is_deleted').default(false),
  deletedAt: timestamp('deleted_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('photos_user_id_idx').on(t.userId),
  index('photos_taken_at_idx').on(t.takenAt),
  index('photos_lat_lng_idx').on(t.lat, t.lng),
  index('photos_p_hash_idx').on(t.pHash),
  index('photos_scene_type_idx').on(t.sceneType),
]);

// ── Albums ──

export const albums = pgTable('albums', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  coverPhotoId: text('cover_photo_id'),
  type: text('type').notNull().default('manual'), // manual | auto | shared | face
  /** For auto-albums: criteria JSON (location, scene, date range, etc.) */
  criteria: jsonb('criteria'),
  photoCount: integer('photo_count').default(0),
  isShared: boolean('is_shared').default(false),
  shareToken: text('share_token'),           // public share link token
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('albums_user_id_idx').on(t.userId),
  index('albums_share_token_idx').on(t.shareToken),
]);

export const albumPhotos = pgTable('album_photos', {
  albumId: text('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  photoId: text('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at').defaultNow().notNull(),
  sortOrder: integer('sort_order').default(0),
}, (t) => [
  uniqueIndex('album_photos_pk').on(t.albumId, t.photoId),
  index('album_photos_photo_idx').on(t.photoId),
]);

// ── Faces ──

export const faceClusters = pgTable('face_clusters', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  /** User-assigned name for this person */
  name: text('name'),
  /** Representative face thumbnail */
  coverFaceKey: text('cover_face_key'),
  faceCount: integer('face_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('face_clusters_user_id_idx').on(t.userId),
]);

export const photoFaces = pgTable('photo_faces', {
  id: text('id').primaryKey(),
  photoId: text('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  clusterId: text('cluster_id').references(() => faceClusters.id, { onDelete: 'set null' }),
  /** Face bounding box as [x, y, w, h] normalised 0-1 */
  bbox: jsonb('bbox').$type<[number, number, number, number]>().notNull(),
  /** 128-d embedding from face-api.js */
  embedding: text('embedding'),
  confidence: real('confidence'),
  /** Face crop thumbnail key */
  faceKey: text('face_key'),
}, (t) => [
  index('photo_faces_photo_idx').on(t.photoId),
  index('photo_faces_cluster_idx').on(t.clusterId),
]);

// ── Duplicates ──

export const photoDuplicates = pgTable('photo_duplicates', {
  photoAId: text('photo_a_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  photoBId: text('photo_b_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  /** Hamming distance between pHashes (0 = identical) */
  distance: integer('distance').notNull(),
}, (t) => [
  uniqueIndex('photo_duplicates_pair_idx').on(t.photoAId, t.photoBId),
]);

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type Album = typeof albums.$inferSelect;
export type NewAlbum = typeof albums.$inferInsert;
export type FaceCluster = typeof faceClusters.$inferSelect;
export type PhotoFace = typeof photoFaces.$inferSelect;
