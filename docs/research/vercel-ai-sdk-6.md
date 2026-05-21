# Vercel AI SDK 6 Evaluation — Foundation for @anvil/ai

**Date:** 2026-05-21
**Status:** Evaluated
**Verdict:** Recommended as @anvil/ai foundation

---

## What Vercel AI SDK 6 Provides

### 1. Streaming RAG
```typescript
import { streamText } from 'ai';

const result = streamText({
  model: openai('gpt-4o'),
  messages,
  tools: { search: searchTool },
});
```

### 2. Agent Class
```typescript
import { Agent } from 'ai';

const researchAgent = new Agent({
  name: 'Research',
  model: openai('gpt-4o'),
  tools: { search: searchTool, scrape: scrapeTool },
  maxSteps: 5,
});
```

### 3. useChat Hook
```typescript
import { useChat } from 'ai/react';

const { messages, input, handleInputChange, handleSubmit } = useChat();
```

### 4. Tool Use
```typescript
import { tool } from 'ai';
import { z } from 'zod';

const searchTool = tool({
  description: 'Search the web',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => searchWeb(query),
});
```

---

## Current @anvil/ai Usage

```typescript
// packages/ai/src/ — custom implementation
// - Local embeddings (ONNX)
// - Meilisearch integration
// - AI categorization
```

### Migration Path

1. Keep existing local embeddings (ONNX) — Vercel AI SDK doesn't replace this
2. Add Vercel AI SDK for LLM features (chat, tool use, agents)
3. Use `useChat` for the AI copilot component
4. Use Agent class for multi-step research tasks

---

## Recommendation

**Adopt Vercel AI SDK 6** as the LLM layer of `@anvil/ai`. Keep custom embeddings. Use SDK for:
- Chat/completions (streaming)
- Tool use (structured outputs)
- Agent orchestration
- React hooks (`useChat`, `useCompletion`)

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/vercel-ai-sdk-6.md` | This document |
