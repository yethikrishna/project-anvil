# Next.js 15 → 16 Migration Guide

*Template created from Maps app migration (commit 02054b7)*

## Breaking Changes

### 1. Config Keys Moved Out of `experimental`

| Next 15 (experimental) | Next 16 (top-level) |
|------------------------|---------------------|
| `experimental.reactCompiler` | `reactCompiler` |
| `experimental.turbo` | `turbopack` |

### 2. `async params` (already required in Next 15.5+)

Dynamic route params are now `Promise<T>`:

```ts
// Before
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
}

// After
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

Client components use `use()` from React:

```tsx
import { use } from 'react';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // ...
}
```

### 3. Turbopack is Default

- `next build` uses Turbopack automatically
- Custom webpack configs still work but may need adjustment
- `experimental.turbo` warnings appear if using old key

## Migration Steps

1. **Update `package.json`**:
   ```json
   "next": "^16.2.0"
   ```

2. **Run `pnpm install`**

3. **Update `next.config.ts`**:
   ```ts
   import { createAnvilNextConfig } from '@anvil/next-config';
   export default createAnvilNextConfig({
     overrides: {
       reactCompiler: true,
       turbopack: {
         rules: {
           '*.svg': { loaders: ['@svgr/webpack'], as: '*.js' },
         },
       },
     },
   });
   ```

4. **Add `tsconfig.json`** (if missing):
   ```json
   {
     "compilerOptions": {
       "moduleResolution": "bundler",
       "jsx": "react-jsx",
       "plugins": [{ "name": "next" }]
     }
   }
   ```

5. **Fix `async params`** in all dynamic routes (`[id]`, `[...slug]`)

6. **Fix type errors** from stricter TypeScript checking

7. **Build and test**: `pnpm --filter @anvil/<app> build`

## Apps Status

| App | Status | Notes |
|-----|--------|-------|
| maps | ✅ Done | First migration, Turbopack enabled |
| search | 🔜 Next | Simple app, should be straightforward |
| docs | 🔜 Next | Has many dynamic routes |
| gmail | 🔜 Next | — |
| drive | 🔜 Next | — |
| youtube | 🔜 Next | — |
| calendar | 🔜 Next | — |
| tasks | 🔜 Next | — |
| blog | 🔜 Next | — |
| admin | 🔜 Next | — |
| marketplace | 🔜 Next | — |
