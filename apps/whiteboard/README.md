**Anvil Whiteboard**

Google Jamboard / Miro clone built with Next.js 15 + Excalidraw.

## Features

### Canvas
- **Infinite canvas** — powered by Excalidraw (open-source, MIT)
- **Full drawing toolkit**: pen/freehand, shapes (rect, ellipse, diamond, arrow, line), text, images
- **Dark theme** — native dark mode with custom neutral background
- **Zoom & pan** — pinch-to-zoom on touch, scroll wheel on desktop

### Boards
- **Gallery view** — grid of all boards with thumbnails
- **Templates**: blank, wireframe (UI mockup), mind map, flowchart, retrospective
- **Thumbnail generation** — auto-generated PNG preview on save
- **Title editing** — inline click-to-edit title

### Auto-save
- Debounced 2-second auto-save after every change
- Save indicator in top bar (Saving… → Saved HH:MM)
- Manual save: Ctrl+S

### Export
- Export to **PNG** (raster)
- Export to **SVG** (vector)
- PDF via browser print (Ctrl+P)

### Presenter Mode
- Full-screen canvas with no toolbar distractions
- Laser pointer (built into Excalidraw)
- Esc to exit

### Collaboration (planned)
- Y.js CRDT state sync via y-websocket
- Real-time cursor sharing
- Named cursors with colour coding
- Presence awareness in toolbar

## Tech Stack

| Layer | Technology |
|-------|------------|
| Canvas | Excalidraw 0.18 |
| Framework | Next.js 15, React 19 |
| Persistence | PostgreSQL + Drizzle ORM |
| Real-time (planned) | Y.js + y-websocket |

## Routes

- `/` — board gallery
- `/board/[id]` — canvas editor

## API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/boards` | List boards |
| POST | `/api/boards` | Create board (with template) |
| GET | `/api/boards/[id]` | Load board state |
| PATCH | `/api/boards/[id]` | Save board state + thumbnail |
| DELETE | `/api/boards/[id]` | Delete board |

## Dev

```bash
cd apps/whiteboard
pnpm dev    # → http://localhost:3012
```
