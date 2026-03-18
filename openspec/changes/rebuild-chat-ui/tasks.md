## Phase 1: TypeScript Migration & Modular Architecture

### 1. Build Tooling & Project Setup
- [x] 1.1 Add TypeScript, tsconfig.json (strict mode), and path aliases (`@shared/*`, `@main/*`, `@renderer/*`)
- [x] 1.2 Create esbuild build scripts: `build:main`, `build:renderer`, `build:preload`, `build:web`, `build:worker`
- [x] 1.3 Update package.json scripts: `start` builds TS then launches Electron from `dist/`, `start:web` builds then runs `dist/web.js`
- [x] 1.4 Add `npm run typecheck` (tsc --noEmit) and `npm run dev` (esbuild watch mode + electron)
- [x] 1.5 Configure ESLint with @typescript-eslint for the new src/ tree

### 2. Shared Types
- [x] 2.1 Create `src/shared/types/ipc.ts` — typed IPC channel map (channel name → args → return type)
- [x] 2.2 Create `src/shared/types/session.ts` — Session, Project, SessionMeta, CachedSession interfaces
- [x] 2.3 Create `src/shared/types/jsonl.ts` — full discriminated union for all .jsonl entry types (init, user, assistant, result, system, summary) and content block types (text, tool_use, tool_result, thinking, image)
- [x] 2.4 Create `src/shared/types/settings.ts` — SettingDefaults, EffectiveSettings interfaces
- [x] 2.5 Create `src/shared/constants.ts` — paths (PROJECTS_DIR, PLANS_DIR, etc.), defaults
- [x] 2.6 Create `src/shared/utils.ts` — pure helper functions extracted from main.js/app.js

### 3. Database Layer Migration
- [x] 3.1 Convert `db.js` → `src/db/index.ts` (connection + migrations)
- [x] 3.2 Extract session CRUD → `src/db/sessions.ts` (getAllCached, upsertCachedSessions, etc.)
- [x] 3.3 Extract search FTS → `src/db/search.ts` (searchByType, upsertSearchEntries, etc.)
- [x] 3.4 Extract settings → `src/db/settings.ts` (getSetting, setSetting, etc.)
- [x] 3.5 Add typed exports and verify all existing tests pass against new modules

### 4. Main Process Migration
- [x] 4.1 Create `src/main/index.ts` — app lifecycle (whenReady, before-quit, window creation, menu)
- [x] 4.2 Extract PTY management → `src/main/pty/manager.ts` (activeSessions Map, spawn, kill, reattach, buffer, onData, onExit)
- [x] 4.3 Extract PTY env setup → `src/main/pty/env.ts` (cleanPtyEnv, shell detection)
- [x] 4.4 Extract cache builder → `src/main/cache/builder.ts` (buildProjectsFromCache, refreshFolder, deriveProjectPath, readSessionFile)
- [x] 4.5 Extract worker scanner → `src/main/cache/scanner.ts` (populateCacheViaWorker)
- [x] 4.6 Extract fs watcher → `src/main/cache/watcher.ts` (startProjectsWatcher, detectSessionTransitions)
- [x] 4.7 Extract IPC handlers into `src/main/ipc/` — one file per domain (projects, sessions, terminals, plans, memory, search, settings, updater)
- [x] 4.8 Extract MCP bridge → `src/main/mcp/server.ts` + `src/main/mcp/tools.ts` (from mcp-bridge.js)
- [x] 4.9 Create handler registry pattern with typed registerHandler<Channel>()
- [x] 4.10 Wire everything in index.ts, verify Electron starts and all IPC works

### 5. Renderer Migration
- [x] 5.1 Create `src/renderer/index.ts` — boot sequence, API detection, global event wiring
- [x] 5.2 Extract sidebar → `src/renderer/views/sidebar.ts` (project list, session list, filters, search)
- [x] 5.3 Extract terminal view → `src/renderer/views/terminal.ts` (xterm.js management, attach, detach, resize)
- [x] 5.4 Extract plan viewer → `src/renderer/views/plans.ts` (CodeMirror editor, save/load)
- [x] 5.5 Extract memory viewer → `src/renderer/views/memory.ts`
- [x] 5.6 Extract stats viewer → `src/renderer/views/stats.ts` (heatmap rendering)
- [x] 5.7 Extract settings viewer → `src/renderer/views/settings.ts` (form generation, save)
- [x] 5.8 Extract file panel → `src/renderer/views/file-panel.ts` (from file-panel.js — tabs, diffs, file viewer)
- [x] 5.9 Create `src/renderer/api/types.ts` (window.api interface definition)
- [x] 5.10 Convert preload → `src/renderer/api/preload.ts`
- [x] 5.11 Convert web shim → `src/renderer/api/web-shim.ts`
- [x] 5.12 Split `public/style.css` into scoped CSS files under `src/renderer/styles/`

### 6. Web Entry & Worker Migration
- [x] 6.1 Convert `web.js` → `src/web/index.ts` (standalone entry point)
- [x] 6.2 Convert `web-server.js` → `src/web/server.ts`
- [x] 6.3 Convert `workers/scan-projects.js` → `src/workers/scan-projects.ts`
- [x] 6.4 Convert `folder-index-state.js` → `src/shared/folder-index-state.ts`

### 7. Migration Validation
- [x] 7.1 All existing tests pass against the new TypeScript build
- [ ] 7.2 Electron mode: launch, browse sessions, open terminal, run Claude, view diffs — all work
- [ ] 7.3 Web mode: `npm run start:web` serves UI, sessions load, terminals work
- [x] 7.4 Remove old .js source files (main.js, preload.js, db.js, etc.) — only dist/ and src/ remain
- [x] 7.5 Update CLAUDE.md with new project structure and build commands

---

## Phase 2: Chat Renderer

### 8. .jsonl Parser
- [x] 8.1 Implement `src/shared/types/jsonl.ts` with full entry type discriminated unions (init, user, assistant, result, system, summary, custom-title, tool_use, tool_result, thinking, image)
- [x] 8.2 Implement `src/renderer/chat/parser.ts` — parse raw .jsonl lines into typed ChatBlock[] array
- [x] 8.3 Handle content block nesting: assistant message → content[] → text | tool_use → tool_result pairing by tool_use_id
- [x] 8.4 Extract cost/token metadata from result entries (costUSD, inputTokens, outputTokens, duration)
- [x] 8.5 Unit tests: parse sample .jsonl files from real Claude Code sessions

### 9. Chat Block Renderers
- [x] 9.1 Create `src/renderer/chat/renderer.ts` — orchestrator that maps ChatBlock[] → DOM via morphdom
- [x] 9.2 Implement `blocks/user-message.ts` — user prompt text with optional image thumbnails
- [x] 9.3 Implement `blocks/assistant-message.ts` — Markdown-rendered text with cost summary footer
- [x] 9.4 Implement `blocks/tool-use.ts` — collapsible header showing tool name + key params (file path, command, pattern)
- [x] 9.5 Implement `blocks/tool-result.ts` — syntax-highlighted content, error styling for is_error
- [x] 9.6 Implement `blocks/code-diff.ts` — unified diff renderer for Edit tool (old_string/new_string → red/green)
- [x] 9.7 Implement `blocks/file-content.ts` — syntax-highlighted file display for Read/Write results
- [x] 9.8 Implement `blocks/bash-output.ts` — monospace output with ANSI color support, scrollable container
- [x] 9.9 Implement `blocks/thinking.ts` — collapsible italic block, collapsed by default
- [x] 9.10 Implement `blocks/permission.ts` — permission request display (accept/reject for live sessions)
- [x] 9.11 Implement `blocks/error.ts` — red-styled error block
- [x] 9.12 Implement `blocks/image.ts` — inline thumbnail with lightbox click handler

### 10. Chat View Integration
- [x] 10.1 Create `src/renderer/views/chat.ts` — main chat view controller (load session, render blocks, manage scroll)
- [x] 10.2 Add chat/terminal toggle button in the terminal header area
- [x] 10.3 Load .jsonl via `read-session-jsonl` API, parse, render full conversation
- [x] 10.4 Default to chat view for completed sessions, terminal view for running sessions
- [x] 10.5 Wire the view into the main renderer so clicking a session loads the chat
- [x] 10.6 Add CSS for chat view: message bubbles/blocks, tool headers, code blocks, etc.

### 11. Real-Time Tailing
- [x] 11.1 Implement `src/renderer/chat/tail.ts` — IPC-based .jsonl tailing (main process watches file, pushes new lines to renderer)
- [x] 11.2 Add `tail-session-jsonl` IPC channel in main process — watches file, sends delta lines
- [x] 11.3 Append new blocks to chat without re-rendering the entire conversation
- [x] 11.4 Auto-scroll to bottom when user is at bottom; preserve position when scrolled up
- [x] 11.5 Show loading spinner for in-progress tool calls (last tool_use without matching tool_result)
- [x] 11.6 Remove spinner when result arrives

---

## Phase 3: Enhanced UX

### 12. Clickable File References
- [x] 12.1 Make all file paths in chat blocks clickable (data-file-path attribute + click handler)
- [x] 12.2 On click: call `read-file-for-panel` API, open file in the side panel with syntax highlighting
- [x] 12.3 For Write/Edit blocks: open diff view in side panel
- [x] 12.4 Handle missing files gracefully (toast "File not found")

### 13. Inline Image Viewing
- [x] 13.1 Render base64 images from user messages as inline thumbnails (max 400px)
- [x] 13.2 Create `src/renderer/components/image-viewer.ts` — lightbox overlay with zoom, close on Escape
- [x] 13.3 Render images from tool results (screenshots, generated images)
- [x] 13.4 Add CSS for lightbox overlay, zoom controls, backdrop blur

### 14. Sticky Bottom Prompt
- [x] 14.1 Create `src/renderer/chat/sticky-prompt.ts` — fixed-position input area below chat scroll container
- [x] 14.2 Forward keystrokes to the active PTY session via `sendInput`
- [x] 14.3 Show "No active session" placeholder when no terminal is running
- [x] 14.4 Add "↓ New messages" floating button when scrolled up and new blocks arrive
- [x] 14.5 Support multi-line input (Shift+Enter for newline, Enter to send)

### 15. Rendered Markdown
- [x] 15.1 Integrate a lightweight Markdown renderer (marked or markdown-it) into `src/renderer/components/markdown.ts`
- [x] 15.2 Render assistant text blocks as Markdown with syntax-highlighted fenced code blocks
- [x] 15.3 Add "Copy" button on hover for all code blocks
- [x] 15.4 For .md file diffs: add a "Preview" toggle that shows rendered Markdown alongside raw diff
- [x] 15.5 Render tables, lists, headers, bold, italic, links in assistant responses

### 16. Polish & Testing
- [x] 16.1 End-to-end test: load a real session .jsonl, verify all block types render correctly
- [x] 16.2 Performance test: load a 1000+ message session, verify render time < 2s
- [x] 16.3 Test chat view in both Electron and web modes
- [x] 16.4 Keyboard navigation: Tab between blocks, Enter to expand/collapse
- [x] 16.5 Update CLAUDE.md with new architecture documentation
