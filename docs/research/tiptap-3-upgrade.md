# Tiptap 3.0 Upgrade Evaluation

**Date:** 2026-05-21
**Status:** Evaluated
**Current:** Tiptap 2.x (apps/docs)
**Target:** Tiptap 3.0

---

## Key Changes in Tiptap 3.0

### 1. Smaller Bundles
- Core editor ~30% smaller
- Extensions are individually importable
- Better tree-shaking

### 2. Full TypeScript Rewrite
- Native TypeScript (no more .d.ts files)
- Strict types for extensions
- Better generic types for ProseMirror integration

### 3. Markdown Extension (Built-in)
- First-class Markdown support
- Bi-directional: WYSIWYG ↔ Markdown
- No more external markdown extensions

### 4. Static Renderer
- `@tiptap/static-renderer` for SSR without a browser
- Render documents on the server without JSDOM
- Critical for SEO and pre-rendering

### 5. New Extension API
- Cleaner `addCommands()`, `addKeyboardShortcuts()`
- Better `Node` and `Mark` APIs
- Async extensions support

---

## Current Usage in Anvil

```typescript
// apps/gmail — Compose modal (uses @tiptap/react, starter-kit, placeholder)
// apps/docs — Full editor (uses @tiptap/react, starter-kit, many extensions)
// apps/docs/api — Hocuspocus + Tiptap transformer
```

### Package.json Status
```json
// apps/docs/api/package.json already specifies:
"@tiptap/core": "^3.0.0",
"@tiptap/static-renderer": "^3.0.0",
"@tiptap/starter-kit": "^3.0.0"
```

---

## Migration Steps

1. **Update imports** (mostly automatic)
2. **Replace markdown extension** (use built-in instead of tiptap-markdown)
3. **Update extension types** (new generic types)
4. **Test static renderer** for document previews
5. **Verify Hocuspocus compatibility** with Tiptap 3.0

---

## Recommendation

**Upgrade when Tiptap 3.0 stable.** The package.json already targets v3. When stable:
- Built-in Markdown eliminates a dependency
- Static renderer enables server-side document previews
- Smaller bundles improve performance

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/tiptap-3-upgrade.md` | This document |
