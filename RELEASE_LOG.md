# Phase 2 — AI Docs + Mail (14 Features)

## Commit: `e01825d` (initial) → `122a11f` (build fixes)

---

## Docs AI Features (7)

### 1. Highlight → AI Rewrite
- **Tiptap Extension:** `AIRewriteExtension` in `apps/docs/lib/ai/tiptap-extensions.ts`
- **UI:** `AIRewriteToolbar` component with 6 rewrite modes (shorter, formal, casual, fix grammar, expand, bullet points)
- **API:** `POST /api/ai { action: "rewrite" }` — context-aware rewriting with document context
- **Integration:** Toolbar button in editor, select text → click AI → choose rewrite mode

### 2. /ai Draft Command
- **Tiptap Extension:** `AICommandsExtension` with `/ai` trigger detection
- **UI:** `AICommandPanel` with Draft tab — describe what you want, choose document type
- **API:** `POST /api/ai { action: "draft" }` — generates structured HTML content
- **Integration:** Type `/ai` in editor → Draft tab → describe → Generate

### 3. /ai Research
- **Tiptap Extension:** `AICommandsExtension` with research command
- **UI:** Research tab in AICommandPanel — query workspace docs, get results with citations
- **API:** `POST /api/ai { action: "research" }` — searches workspace docs with relevance scoring + AI synthesis
- **Integration:** Type `/ai` → Research tab → enter query → inserts synthesized results with citations

### 4. Inline AI Suggestions
- **Tiptap Extension:** `AISuggestExtension` with ProseMirror plugin for inline ghost text
- **UI:** `AISuggestionBar` (bottom bar) showing accept/reject with keyboard shortcuts (Enter/Escape)
- **API:** `POST /api/ai { action: "suggest" }` — context-aware continuation suggestions
- **Integration:** Periodic suggestions appear as grayed text, accept with Enter or reject with Escape

### 5. Auto Title & Summary on Save
- **Hook:** `useAutoTitleSummary` in `apps/docs/lib/ai/use-auto-title.ts`
- **API:** `POST /api/ai { action: "title" }` and `{ action: "summary" }`
- **Integration:** Generates title from content, shows summary in document header, saves to metadata

### 6. AI Translation
- **UI:** Translate tab in AICommandPanel with 15 language options
- **API:** `POST /api/ai { action: "translate" }` — translates selected text preserving HTML formatting
- **Integration:** Select text → `/ai` → Translate tab → pick language → Translate

### 7. Smart Templates
- **UI:** `TemplatePicker` in `apps/docs/app/templates/TemplatePicker.tsx` with 6 AI template types
- **API:** `POST /api/ai { action: "template" }` — generates proposal, meeting notes, report, blog post, memo, letter
- **Integration:** File → New from Template → ✨ AI Generate → describe requirements → Generate

---

## Mail AI Features (7)

### 8. AI Inbox Categories
- **Logic:** `classifyInboxCategory()` in `apps/gmail/app/lib/ai-mail.ts`
- **UI:** `InboxCategoryTabs` — Primary, Updates, Action Needed, FYI tabs with counts
- **Integration:** Category tabs above inbox, classifies each email by sender patterns, subject, and body analysis

### 9. Thread Summary
- **Logic:** `generateThreadSummary()` — instant local analysis with key points, action items, sentiment
- **UI:** `ThreadSummaryPanel` — summary card at top of thread with AI Enhance button
- **API:** `POST /api/ai { action: "summarize-thread" }` — full AI-powered analysis
- **Integration:** Opens automatically when viewing a thread, shows summary + key points + action items

### 10. AI Compose
- **Logic:** `buildComposeContext()` — analyzes thread for writing style, participants, recent messages
- **UI:** `AIComposeModal` — compose window with ✨ AI Draft button, detects writing style
- **API:** `POST /api/ai { action: "compose" }` — generates reply based on thread context
- **Integration:** Reply button → AI Compose modal → AI Draft generates contextually appropriate response

### 11. Summarize Unread
- **Logic:** `generateUnreadDigest()` — categorizes all unread, identifies urgent items
- **UI:** `UnreadDigestModal` — full digest view with categories, priorities, AI Digest enhancement
- **API:** `POST /api/ai { action: "digest" }` — AI-generated prioritized digest
- **Integration:** Unread button in toolbar → modal shows categorized digest with AI enhancement

### 12. Smart Reply Suggestions
- **Logic:** `generateSmartReplies()` — context-aware 1-click replies based on thread sentiment, questions, action items
- **UI:** `SmartReplyBar` — colored reply chips (professional/blue, casual/green, brief/gray)
- **Integration:** Appears at bottom of thread view, click to instantly insert reply

### 13. AI Semantic Search
- **Logic:** `semanticSearchEmails()` — local TF-IDF-like scoring with proximity bonuses and recency
- **UI:** `SemanticSearchBar` — search bar with ✨ AI button for enhanced search
- **API:** `POST /api/ai { action: "semantic-search" }` — AI-powered relevance ranking
- **Integration:** Search bar in inbox header, shows results with match reasons and relevance scores

### 14. Smart Filters
- **Logic:** `generateSmartFilters()` — analyzes sender patterns to suggest auto-archive/label/star rules
- **UI:** `SmartFilterPanel` — filter suggestions with confidence percentages and Apply buttons
- **Integration:** Appears in sidebar, suggests rules based on email behavior patterns

---

## Architecture

### @anvil/ai Package (`packages/ai/`)
- `createAI()` factory — configurable OpenAI or Ollama provider
- `ai.generate(messages, options)` — text generation with streaming support
- `ai.embed(text)` — embeddings for semantic search
- `ai.stream(text, callback)` — real-time streaming generation
- Agent runtime with email triage, file organization, and schedule agents
- Tool definitions: FILE_SEARCH, FILE_READ, DOCUMENT_WRITE, EMAIL_SEARCH, EMAIL_SEND, WEB_SEARCH, CALENDAR_CREATE
- React hooks (useChat, useCompletion) via `@anvil/ai/react` (separate import to avoid server bundle issues)

### Dual-Layer Design
Every AI feature has:
1. **Local/instant fallback** — works without AI provider, uses heuristics and NLP patterns
2. **AI-enhanced mode** — "✨ AI Enhance" button calls the API route for deeper analysis

### Configuration
```env
AI_PROVIDER=ollama          # or openai
AI_MODEL=llama3             # any ollama/openai model
AI_API_KEY=sk-...           # for openai
AI_BASE_URL=http://localhost:11434  # for ollama
```

---

## Build Status
- ✅ `@anvil/docs` — builds clean
- ✅ `@anvil/gmail` — builds clean
- ✅ `@anvil/ai` — TypeScript compiles clean
- ✅ All TypeScript errors resolved
- ✅ All imports resolved, workspace dependencies linked
