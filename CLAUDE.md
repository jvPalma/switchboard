<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Switchboard

Switchboard is an Electron desktop app for browsing, searching, and managing Claude Code CLI sessions. It reads session data from `~/.claude/projects/`, provides built-in terminals via `node-pty`, and emulates an IDE for Claude CLI (showing file diffs/opens in a side panel via a per-session MCP WebSocket server).

## Commands

```bash
npm install          # Install deps (runs postinstall automatically)
npm start            # Build all TS + launch Electron
npm run start:web    # Build all TS + launch standalone web server
npm run dev          # esbuild watch mode + Electron (fast iteration)
npm run electron     # Launch Electron only (skip build)
npm test             # Run tests (node --test)
npm run typecheck    # tsc --noEmit (type checking only)
npm run lint         # ESLint on src/
npm run build:all    # Build all esbuild targets
npm run build        # Build all + electron-builder for current platform
npm run bundle:codemirror  # Rebuild CodeMirror bundle only
```

Individual build targets: `npm run build:main`, `build:preload`, `build:renderer`, `build:web`, `build:worker`.

Tests use Node's built-in test runner (`node:test` + `node:assert/strict`). Run a single test file with `node --test test/folder-index-state.test.js`.

TypeScript test files (`.test.ts`) run with: `node --experimental-strip-types --test test/chat-parser.test.ts`

Chat-related test files:
- `test/chat-parser.test.ts` — parser unit tests (30 tests, no DOM required)
- `test/chat-renderer.test.ts` — end-to-end parser integration (all block types, multi-turn)
- `test/chat-performance.test.ts` — parser performance with 1000+ entry sessions

## Architecture

TypeScript Electron app (strict mode) with vanilla DOM + morphdom. Source lives in `src/`, esbuild bundles to `dist/` (Node targets) and `public/` (browser target).

### Source tree

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App lifecycle, window creation, menu
│   ├── broadcast.ts         # mainWindow ref, broadcastToWeb, sendToRenderer
│   ├── constants.ts         # Path constants
│   ├── db.ts                # Typed re-exports of DB functions
│   ├── ipc/                 # IPC handler registrations (one file per domain)
│   │   ├── registry.ts      # Typed registerHandler<Channel>()
│   │   ├── projects.ts, sessions.ts, terminals.ts, plans.ts
│   │   ├── memory.ts, search.ts, settings.ts, updater.ts
│   │   └── index.ts         # Barrel — registerAllHandlers()
│   ├── pty/                 # PTY management
│   │   ├── manager.ts       # activeSessions Map, spawn, kill, reattach
│   │   └── env.ts           # cleanPtyEnv, shell detection
│   ├── cache/               # Session cache + worker
│   │   ├── builder.ts       # buildProjectsFromCache, refreshFolder
│   │   ├── scanner.ts       # populateCacheViaWorker
│   │   └── watcher.ts       # fs.watch on projects dir
│   └── mcp/                 # MCP bridge
│       ├── server.ts        # WebSocket MCP server lifecycle
│       └── tools.ts         # MCP tool implementations
├── renderer/                # Browser/renderer process
│   ├── index.ts             # Boot, API detection, event wiring
│   ├── state.ts             # Shared mutable state
│   ├── utils.ts             # Pure helpers (formatDate, etc.)
│   ├── themes.ts            # Terminal theme definitions
│   ├── globals.d.ts         # Ambient types for xterm, morphdom, CodeMirror
│   ├── api/
│   │   ├── types.ts         # SwitchboardApi interface
│   │   ├── preload.ts       # Electron contextBridge → dist/preload.js
│   │   └── web-shim.ts      # fetch/WS shim for browser mode
│   ├── views/               # View controllers
│   │   ├── sidebar.ts, terminal.ts, plans.ts, memory.ts
│   │   ├── stats.ts, settings.ts, file-panel.ts, jsonl.ts
│   └── styles/              # Scoped CSS
│       ├── base.css, sidebar.css, terminal.css, file-panel.css
├── shared/                  # Shared between main + renderer
│   ├── types/
│   │   ├── ipc.ts           # IPC channel map (channel → args → return)
│   │   ├── session.ts       # Session, Project, SessionMeta types
│   │   ├── jsonl.ts         # .jsonl entry discriminated unions
│   │   ├── settings.ts      # Settings shape + defaults
│   │   └── index.ts         # Barrel
│   ├── constants.ts         # Paths, defaults
│   ├── folder-index-state.ts
│   └── utils.ts             # Pure helpers
├── web/                     # Standalone web entry point
│   ├── index.ts             # node dist/web.js (no Electron)
│   └── server.ts            # Express + WebSocket server factory
├── workers/
│   └── scan-projects.ts     # Background scanner
└── db/
    ├── index.ts             # Barrel
    ├── connection.ts        # SQLite connection + migrations
    ├── sessions.ts          # Session CRUD
    ├── search.ts            # FTS5 operations
    ├── settings.ts          # Settings CRUD
    └── types.ts             # DB row interfaces
```

### Chat view system (`src/renderer/chat/`)

Renders `.jsonl` session data as a readable chat conversation (alternative to raw terminal view).

```
src/renderer/chat/
├── parser.ts              # parseSession(): JsonlEntry[] → ChatBlock[]
├── renderer.ts            # renderBlock() / renderBlocks() — orchestrator using morphdom
├── types.ts               # ChatBlock discriminated union (9 block types)
├── tail.ts                # Real-time tailing via tail-session-jsonl IPC channel
├── keyboard.ts            # Tab/Enter/Escape keyboard navigation on collapsible blocks
└── blocks/                # Per-type block renderers (each exports a render function)
    ├── user-message.ts
    ├── assistant-message.ts  # Renders markdown via `marked` library
    ├── tool-use.ts           # Collapsible header showing tool name + key param
    ├── tool-result.ts        # Delegates to specialized sub-renderers
    ├── thinking.ts           # Collapsible thinking block
    ├── error.ts
    ├── image.ts
    ├── code-diff.ts          # Inline diff for Edit tool results
    ├── file-content.ts       # Read/Write file content display
    ├── bash-output.ts        # Bash command output with ANSI support
    └── permission.ts
```

**Data flow**: `.jsonl` file → `readSessionJsonl` IPC → `parseSession()` → `ChatBlock[]` → `renderBlocks()` → DOM. Live sessions use `tail-session-jsonl` / `stop-tail-session-jsonl` IPC channels to push new lines in real time, parsed incrementally in `tail.ts`.

**IPC channels**: `readSessionJsonl` (request-response), `tail-session-jsonl` (main→renderer push), `stop-tail-session-jsonl` (fire-and-forget).

**Dependencies**: `marked` (npm) for markdown rendering in assistant messages.

### Build targets (esbuild)

| Target | Entry | Output | Platform |
|--------|-------|--------|----------|
| main | `src/main/index.ts` | `dist/main.js` | node |
| preload | `src/renderer/api/preload.ts` | `dist/preload.js` | node |
| renderer | `src/renderer/index.ts` | `public/app.bundle.js` | browser (IIFE) |
| web | `src/web/index.ts` | `dist/web.js` | node |
| worker | `src/workers/scan-projects.ts` | `dist/workers/scan-projects.js` | node |
| codemirror | `public/codemirror-setup.js` | `public/codemirror-bundle.js` | browser (IIFE) |

Path aliases: `@shared/*`, `@main/*`, `@renderer/*`, `@db/*` (resolved by esbuild + tsconfig).

### Data layer

- **SQLite** (`src/db/`) — `better-sqlite3` at `~/.switchboard/switchboard.db`. Tables: `session_meta`, `session_cache`, `cache_meta`, `search_fts`/`search_map` (FTS5 trigram), `settings`.
- **Folder index state** (`src/shared/folder-index-state.ts`) — Computes effective mtime for a session folder.

### MCP bridge (`src/main/mcp/`)

Per-session WebSocket MCP server that makes Claude CLI treat Switchboard as an IDE. Each PTY session gets its own server on a random port with an auth token. Lock files are written to `~/.claude/ide/`. Implements: `openDiff`, `openFile`, `close_tab`, `closeAllDiffTabs`, `getDiagnostics`. Diff responses are async — the JSON-RPC call blocks until the user accepts/rejects in the renderer.

### IPC pattern

Main↔renderer communication uses two patterns:
- `ipcMain.handle` / `ipcRenderer.invoke` — Request-response (most operations)
- `ipcMain.on` / `ipcRenderer.send` — Fire-and-forget (terminal input, resize, MCP diff responses)
- `webContents.send` / `ipcRenderer.on` — Main→renderer push (terminal data, MCP events, notifications)

### Native modules

`better-sqlite3` and `node-pty` are native modules unpacked from asar. macOS builds require custom entitlements (`build/entitlements.mac.plist`) for JIT and unsigned memory execution.

## Release process

Use the `/release` slash command, which automates: version bump via `npm version patch`, commit, tag, push, wait for CI, publish GitHub release with categorized notes.

## Key conventions

- **Package manager**: `npm` (not yarn)
- **TypeScript** — strict mode, all source in `src/`, esbuild bundles to `dist/` and `public/`
- **No frontend framework** — vanilla TypeScript + morphdom for efficient DOM diffing
- **Single-window app** — one `BrowserWindow`, sidebar + main area layout
- **Dual-mode** — runs as Electron desktop app or standalone web server (`npm run start:web`)
- **Session data source** — reads Claude CLI's `~/.claude/projects/` directory structure where each project folder contains `.jsonl` session files
- **CodeMirror** — used for plan/memory editing and diff views; bundled as an IIFE via esbuild (not loaded as ES modules)
- **Path aliases** — `@shared/*`, `@main/*`, `@renderer/*`, `@db/*` in both tsconfig and esbuild
