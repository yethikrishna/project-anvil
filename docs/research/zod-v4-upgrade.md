# Zod v4 Upgrade Plan

**Date:** 2026-05-21
**Status:** Planned

---

## Zod v4 Highlights

- 14× faster parsing (new architecture)
- `@zod/mini` — 3KB minimal validation for edge/CF Workers
- Better error messages
- TypeScript 5.8+ inference improvements
- `z.interface()` as replacement for `z.object()` with better performance

---

## Migration

```typescript
// Before (Zod v3)
import { z } from 'zod';
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

// After (Zod v4) — mostly identical
import { z } from 'zod';
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

// For edge/CF Workers — use @zod/mini (3KB vs 13KB)
import { z } from '@zod/mini';
const schema = z.object({
  email: z.string().check(z.email()),
  name: z.string().check(z.minLength(1)),
});
```

---

## Files Affected

```bash
grep -rn "from 'zod'" packages/ apps/ --include="*.ts" | wc -l
```

All Zod imports across packages need updating. API is mostly compatible.

---

## Recommendation

Upgrade when Zod v4 stable. Use `@zod/mini` for edge functions (auth package, CF Workers).

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/zod-v4-upgrade.md` | This document |
