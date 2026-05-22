# Anvil Chat — AI Command Center

The AI-powered command center for the Anvil productivity suite. Talk to your Mail, Drive, Calendar, and Docs like a single intelligent assistant.

## Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Chat UI** | Real-time streaming chat with markdown, code highlighting, and rich tool result cards |
| 2 | **Tool Use Framework** | AI acts across Mail, Drive, Calendar, and Docs via 12 structured tools |
| 3 | **Attention Scan** | Priority digest — what needs your attention right now |
| 4 | **Draft Reply** | Reads your email thread, writes a reply, saves to drafts |
| 5 | **Find & Share** | Searches Drive, creates share links, optionally emails them |
| 6 | **Schedule Meeting** | Checks calendars, finds best slot, sends invites |
| 7 | **Weekly Summary** | Aggregates Mail + Docs + Calendar into a productivity report |
| 8 | **Persistent Memory** | Conversations saved to IndexedDB — never lose context |
| 9 | **Voice Input** | Push-to-talk with local Whisper or OpenAI fallback |
| 10 | **Voice Output** | TTS with speed control and audio waveform player |
| 11 | **Multi-turn Tool Use** | AI chains actions: find doc → summarize → email team |
| 12 | **Context Accumulation** | AI remembers your files, people, topics, and preferences |

## Architecture

```
app/
├── page.tsx              # Main chat interface — all state, handlers, modals
└── api/
    ├── chat/             # POST — streaming chat with multi-turn tool loop
    ├── attention/        # GET  — priority digest from Mail + Calendar
    ├── draft-reply/      # POST — AI email draft generator
    ├── find-share/       # POST — Drive search + share link creation
    ├── schedule/         # POST (propose) + PUT (confirm) meeting scheduler
    ├── weekly-summary/   # GET  — weekly activity digest
    ├── orchestrate/      # POST — multi-step cross-app workflow executor
    ├── conversations/    # GET/POST/DELETE — conversation management
    └── voice/
        ├── stt/          # POST — speech-to-text (Whisper)
        └── tts/          # POST — text-to-speech (OpenAI TTS)

components/
├── MessageBubble.tsx       # Chat message with markdown, tool cards, suggestions
├── StreamingMessage.tsx    # Live streaming AI response with tool progress
├── ChatInput.tsx           # Input bar with voice, commands, attachments
├── ChatSidebar.tsx         # Conversation list with search and management
├── AttentionPanel.tsx      # Priority digest slide-out panel
├── WorkflowProgress.tsx    # Multi-step tool chain visualization
├── RichToolResults.tsx     # Rich cards for email, file, calendar, search results
├── DraftPreviewModal.tsx   # Email draft preview with tone selector
├── MeetingSchedulerModal.tsx # AI-powered meeting scheduler
├── WeeklySummaryWidget.tsx # Weekly productivity digest widget
├── CommandPalette.tsx      # ⌘K command palette
├── SearchModal.tsx         # ⌘F conversation search
├── ApprovalGate.tsx        # Approval gate for high-risk AI actions
├── VoiceButton.tsx         # Animated push-to-talk button
├── VoiceOutput.tsx         # TTS audio player with controls
├── ExportButton.tsx        # Markdown/JSON conversation export
└── ...

lib/
├── chat-engine.ts        # Core AI engine — multi-turn tool loop, streaming
├── tool-executor.ts      # Tool implementations with real API calls + retry/cache
├── tool-orchestrator.ts  # Predefined multi-step workflow chains
├── intent-router.ts      # Pattern-based intent detection → system prompt optimization
├── memory.ts             # IndexedDB persistence (client-side only)
├── context-manager.ts    # User pattern analysis, preference detection
├── context-extractor.ts  # NLP entity extraction from messages
├── sse-parser.ts         # SSE stream parser with full event type support
├── use-voice-input.ts    # React hook for STT with MediaRecorder
└── types.ts              # Shared TypeScript types
```

## Quick Start

```bash
# 1. Copy env and configure
cp .env.example .env.local
# Edit .env.local with your API keys

# 2. Install deps (from monorepo root)
pnpm install

# 3. Run dev server
pnpm dev --filter=chat

# 4. Open http://localhost:3000
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` | Command palette |
| `⌘F` | Search conversations |
| `⌘E` | Toggle attention panel |
| `⌘⇧N` | New conversation |

## AI Tool Reference

The AI has access to these 12 tools from `@anvil/ai`:

| Tool | What it does |
|------|-------------|
| `email_search` | Search emails by query, folder, date |
| `email_send` | Send an email (requires confirmation) |
| `email_read_thread` | Read full email thread |
| `email_save_draft` | Save email as draft |
| `email_archive` | Archive/label emails |
| `file_search` | Search Drive files |
| `file_read` | Read file content |
| `file_share` | Create share link |
| `document_write` | Create/update Docs |
| `calendar_create_event` | Create calendar event |
| `calendar_check_availability` | Check free/busy slots |
| `web_search` | Search the web (Brave) |

## Settings

Accessible via the ⚙️ Settings button:

- **Communication Style**: Concise / Detailed / Technical / Casual — adapts AI verbosity
- **Email Tone**: Professional / Friendly / Casual / Formal — default tone for email drafts
- **Approval Gates**: Require confirmation before sending emails or creating calendar events
- **Voice**: Enable voice output, choose voice, set playback speed
- **Context Retention**: How many days of conversation history to keep

## Data & Privacy

All conversation history is stored **client-side only** in IndexedDB — nothing is persisted server-side by the chat app. The AI API calls go to your configured `OPENAI_API_URL`.
