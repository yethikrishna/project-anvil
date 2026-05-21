# Drizzle ORM Integration — Type-Safe PostgreSQL Queries

**Date:** 2026-05-21
**Status:** Evaluated + Recommended
**Note:** Already in use! (apps/docs/api/src/db/)

---

## Current Usage

Drizzle ORM is **already integrated** in the Docs API:

```typescript
// apps/docs/api/src/db/index.ts — uses drizzle-orm
import { drizzle } from 'drizzle-orm/node-postgres';
import { documents } from './schema.js';
import { eq } from 'drizzle-orm';
```

---

## Evaluation

| Feature | Drizzle | Prisma | Kysely |
|---------|---------|--------|--------|
| Bundle size | ~30KB | ~2MB | ~50KB |
| Type safety | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Edge compatible | Yes | Limited | Yes |
| PGlite WASM | Yes | No | No |
| Row Level Security | Yes | Limited | Yes |
| Migration system | drizzle-kit | prisma migrate | Manual |
| Query builder | SQL-like | Prisma Client | SQL-like |
| Learning curve | Low | Low | Medium |

---

## Recommendation

**Keep Drizzle.** It's already integrated, type-safe, edge-compatible, and works with PGlite WASM. No need to change.

### Extend to Other Apps

```typescript
// Pattern for other apps
// apps/drive/api/src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, uuid, text, bigint, timestamp } from 'drizzle-orm/pg-core';

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  mimeType: text('mime_type'),
  size: bigint('size', { mode: 'number' }),
  parentId: uuid('parent_id'),
  ownerId: uuid('owner_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/drizzle-orm.md` | This document |
