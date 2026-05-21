# tRPC v11 Evaluation — Internal API Type Safety

**Date:** 2026-05-21
**Status:** Evaluated
**Verdict:** Recommended for internal APIs, keep OpenAPI for public

---

## Approach

```
Internal APIs (app → backend): tRPC v11 (type-safe, no serialization)
Public APIs (external consumers): OpenAPI (documented, standard)
```

### tRPC v11 Features
- Native Next.js RSC support
- `createTRPCClient` for server-side calls
- WebSocket subscriptions for real-time
- Batched requests (multiple queries in one HTTP call)

### Pattern

```typescript
// packages/api/src/router.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  files: t.router({
    list: t.procedure.input(z.object({ parentId: z.string() })).query(async ({ input }) => {
      return db.select().from(files).where(eq(files.parentId, input.parentId));
    }),
    create: t.procedure.input(CreateFileSchema).mutation(async ({ input }) => {
      return db.insert(files).values(input).returning();
    }),
  }),
});

export type AppRouter = typeof appRouter;
```

---

## Recommendation

**Adopt for new internal APIs.** Keep existing REST endpoints. Gradually add tRPC routers for app-to-backend communication where type safety matters most (Drive, Docs, Gmail data operations).

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/trpc-v11-evaluation.md` | This document |
