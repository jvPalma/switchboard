## Context

Switchboard is an ~11K-line plain JavaScript Electron app. The largest files are `public/app.js` (3267 lines), `main.js` (1753 lines), and `web.js` (1076 lines). All rendering is vanilla DOM manipulation with morphdom diffing. Session data lives in `.jsonl` files at `~/.claude/projects/`, where each line is a JSON entry with structured message data including tool calls, file contents, and diffs.

Claude Code's TUI renders a rich conversation interface in the terminal: user prompts, assistant responses with Markdown formatting, tool-use blocks (Read, Write, Edit, Bash, WebSearch, etc.) with expandable file contents, code diffs with syntax highlighting, cost/token displays, permission prompts, thinking/loading indicators, and progress bars.

## Goals / Non-Goals

**Goals:**
- Modular TypeScript codebase with clear file boundaries and shared types
- Chat UI that shows every element Claude Code's TUI shows, parsed from `.jsonl` data
- Real-time `.jsonl` tailing for live sessions (watch file changes, append new entries)
- Clickable file references, inline images, sticky prompt, rendered Markdown
- Both Electron and web (`node web.js`) modes continue to work

**Non-Goals:**
- Replacing the terminal view entirely (keep it as a tab/toggle option)
- Server-side rendering or React/Vue/Svelte (stay vanilla TS + morphdom)
- Changes to Claude CLI or `.jsonl` format
- Mobile-responsive layout

## Decisions

### 1. Stay vanilla TypeScript + morphdom (no framework)

**Decision:** Continue with vanilla TS and morphdom for DOM diffing. No React/Vue/Svelte.
**Why:** The codebase is already vanilla DOM. Introducing a framework would require rewriting everything AND learning the framework's patterns. morphdom is already proven here. TypeScript alone gives us the type safety we need.
**Trade-off:** More manual DOM management, but simpler build, smaller bundle, no framework churn.

### 2. Module structure: domain-driven folders

**Decision:** Organize by domain, not by layer:

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # Entry point (app lifecycle, window creation)
│   ├── ipc/                 # IPC handler registrations
│   │   ├── projects.ts
│   │   ├── sessions.ts
│   │   ├── terminals.ts
│   │   ├── plans.ts
│   │   ├── memory.ts
│   │   ├── search.ts
│   │   ├── settings.ts
│   │   └── updater.ts
│   ├── pty/                 # PTY management
│   │   ├── manager.ts       # activeSessions Map, spawn, kill, reattach
│   │   └── env.ts           # cleanPtyEnv, shell detection
│   ├── cache/               # Session cache + worker
│   │   ├── builder.ts       # buildProjectsFromCache, refreshFolder
│   │   ├── scanner.ts       # populateCacheViaWorker
│   │   └── watcher.ts       # fs.watch on projects dir
│   ├── mcp/                 # MCP bridge (extracted from mcp-bridge.js)
│   │   ├── server.ts
│   │   └── tools.ts
│   └── menu.ts              # Electron menu
├── renderer/                # Browser/renderer process
│   ├── index.ts             # Boot, API detection, event wiring
│   ├── api/                 # window.api types + web shim
│   │   ├── types.ts         # Full IPC channel type definitions
│   │   ├── preload.ts       # Electron preload (contextBridge)
│   │   └── web-shim.ts      # fetch/WS shim for browser mode
│   ├── views/               # Top-level view controllers
│   │   ├── sidebar.ts       # Project/session list, filters, search
│   │   ├── terminal.ts      # xterm.js terminal management
│   │   ├── chat.ts          # NEW: Chat message renderer
│   │   ├── plans.ts         # Plan viewer/editor
│   │   ├── memory.ts        # Memory viewer/editor
│   │   ├── stats.ts         # Stats/heatmap viewer
│   │   ├── settings.ts      # Settings form
│   │   └── file-panel.ts    # Side panel (diffs, file viewer)
│   ├── chat/                # NEW: Chat components
│   │   ├── parser.ts        # .jsonl line parser → typed message objects
│   │   ├── renderer.ts      # Message → DOM (morphdom)
│   │   ├── blocks/          # Per-block-type renderers
│   │   │   ├── user-message.ts
│   │   │   ├── assistant-message.ts
│   │   │   ├── tool-use.ts
│   │   │   ├── tool-result.ts
│   │   │   ├── code-diff.ts
│   │   │   ├── file-content.ts
│   │   │   ├── bash-output.ts
│   │   │   ├── thinking.ts
│   │   │   ├── permission.ts
│   │   │   ├── error.ts
│   │   │   ├── image.ts
│   │   │   └── markdown.ts
│   │   ├── tail.ts          # Real-time .jsonl file tailing
│   │   └── sticky-prompt.ts # Fixed bottom input area
│   ├── components/          # Reusable UI primitives
│   │   ├── code-block.ts    # Syntax-highlighted code with copy button
│   │   ├── diff-view.ts     # Inline/side-by-side diff
│   │   ├── image-viewer.ts  # Lightbox image preview
│   │   ├── markdown.ts      # Markdown → HTML renderer
│   │   ├── spinner.ts       # Loading/thinking indicators
│   │   └── toast.ts         # Notifications
│   └── styles/              # CSS modules or scoped styles
│       ├── chat.css
│       ├── sidebar.css
│       ├── terminal.css
│       ├── file-panel.css
│       └── base.css
├── shared/                  # Shared between main + renderer
│   ├── types/
│   │   ├── ipc.ts           # IPC channel names + payload types
│   │   ├── session.ts       # Session, Project, SessionMeta types
│   │   ├── jsonl.ts         # .jsonl entry types (message, tool_use, etc.)
│   │   └── settings.ts      # Settings shape + defaults
│   ├── constants.ts         # Paths, defaults
│   └── utils.ts             # Pure helpers
├── web/                     # Standalone web entry point
│   └── index.ts             # node web.js equivalent
├── workers/
│   └── scan-projects.ts     # Background scanner
└── db/
    ├── index.ts             # Database connection + migrations
    ├── sessions.ts          # Session CRUD
    ├── search.ts            # FTS5 operations
    └── settings.ts          # Settings CRUD
```

**Why:** The current codebase has 3 monolithic files (main.js, app.js, web.js) that each mix concerns. Domain-driven folders make it possible to work on terminal vs. chat vs. settings without touching unrelated code. Shared types ensure IPC contracts are enforced at compile time.

### 3. .jsonl entry types (Claude Code message format)

**Decision:** Define comprehensive TypeScript types for every `.jsonl` entry Claude Code produces.

Based on Claude Code's actual output format, entries include:

```typescript
// Top-level entry discriminated by `type` field
type JsonlEntry =
  | InitEntry          // { type: 'init', cwd, sessionId, version, ... }
  | UserMessage        // { type: 'user', message: { role: 'user', content: ContentBlock[] }, ... }
  | AssistantMessage   // { type: 'assistant', message: { role: 'assistant', content: ContentBlock[], ... }, costUSD, ... }
  | ResultMessage      // { type: 'result', result: ContentBlock[], costUSD, ... }
  | SummaryMessage     // { type: 'summary', ... }
  | SystemEntry        // { type: 'system', ... }

// Content blocks within messages
type ContentBlock =
  | TextBlock          // { type: 'text', text: string }
  | ToolUseBlock       // { type: 'tool_use', id, name, input: object }
  | ToolResultBlock    // { type: 'tool_result', tool_use_id, content: string | ContentBlock[] }
  | ThinkingBlock      // { type: 'thinking', thinking: string }
  | ImageBlock         // { type: 'image', source: { type: 'base64', media_type, data } }

// Tool names → specific input shapes
type ToolName =
  | 'Read'             // input: { file_path, offset?, limit? }
  | 'Write'            // input: { file_path, content }
  | 'Edit'             // input: { file_path, old_string, new_string }
  | 'Bash'             // input: { command, description?, timeout? }
  | 'Glob'             // input: { pattern, path? }
  | 'Grep'             // input: { pattern, path?, include? }
  | 'WebSearch'        // input: { query }
  | 'WebFetch'         // input: { url }
  | 'TodoWrite'        // input: { todos: Todo[] }
  | 'Agent'            // input: { prompt, ... }
  | ...                // MCP tools, etc.
```

### 4. Chat renderer architecture

**Decision:** The chat view parses `.jsonl` entries into a flat list of "blocks" and renders each block with a dedicated component. morphdom diffs the entire chat container on each update.

**Flow:**
1. `parser.ts` reads `.jsonl` entries → produces `ChatBlock[]`
2. `renderer.ts` maps `ChatBlock[]` → DOM tree (one div per block)
3. morphdom patches the container efficiently
4. For live sessions: `tail.ts` watches the `.jsonl` file, appends new entries, re-renders only the delta

**Block types rendered:**
- User message (prompt text, sometimes with images)
- Assistant text (Markdown-rendered)
- Tool use header (tool name + summary of what it does)
- Tool result (file content, bash output, search results, diff)
- Thinking block (collapsible, italic)
- Permission request (accept/reject buttons for live sessions)
- Error block (red, with details)
- Cost/token summary (per-message and cumulative)
- Loading spinner (for in-progress tool calls)

### 5. Build tooling

**Decision:** Use esbuild for all bundling (already a dev dependency). Two build targets:
- **Main process:** `esbuild src/main/index.ts --bundle --platform=node --external:electron --external:better-sqlite3 --external:node-pty`
- **Renderer:** `esbuild src/renderer/index.ts --bundle --platform=browser` (plus CSS)
- **Web entry:** `esbuild src/web/index.ts --bundle --platform=node --external:better-sqlite3 --external:node-pty`

**Why:** esbuild is already used for the CodeMirror bundle. It handles TypeScript natively, is extremely fast, and doesn't require ts-node or tsc for runtime.

### 6. Real-time .jsonl tailing

**Decision:** Use `fs.watch` + periodic `fs.read` with byte offset tracking to tail `.jsonl` files for live sessions.

**Why:** Claude Code writes to `.jsonl` files as the conversation progresses. By watching the file and reading only new bytes since last read, we get real-time message updates without polling the full file.

**Flow:**
1. When a session terminal is active, start tailing its `.jsonl` file
2. On file change, read from last known offset to EOF
3. Parse new lines, append to block list, morphdom-patch
4. On session end, stop tailing

### 7. Sticky prompt

**Decision:** A fixed-position input area at the bottom of the chat view. When the user types, input is forwarded to the PTY (same as terminal input). The chat view scrolls independently above it.

**Why:** In the terminal, you must scroll to the bottom to type. In the chat view, the conversation can be long. Decoupling scroll position from input position is essential for usability.

## Risks / Trade-offs

- **Migration risk:** Converting ~11K lines to TypeScript while maintaining both Electron and web modes. Mitigated by doing it file-by-file with tests at each step.
- **`.jsonl` format stability:** Claude Code's format may change between versions. Mitigated by making the parser tolerant of unknown entry types (render as raw JSON fallback).
- **Performance:** Large sessions (1000+ messages) need virtual scrolling or lazy rendering. Deferred to Phase 3 or a follow-up.
- **Dual build:** Main process (Node) and renderer (browser) are separate esbuild targets. Need to ensure shared types work in both.

## Open Questions

- None blocking. The `.jsonl` format is well-understood from direct inspection of session files.
