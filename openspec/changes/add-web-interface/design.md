## Context
Switchboard is an Electron app. All renderer↔main communication goes through `preload.js` (IPC context bridge exposing `window.api`). The renderer is vanilla JS/HTML/CSS with no framework — it reads `window.api.*` everywhere. The goal is to make the same renderer work in a plain browser by providing an alternative `window.api` implementation over HTTP + WebSocket.

Express is already a production dependency. `node-pty` and `better-sqlite3` work in plain Node.js. The MCP bridge is already WebSocket-based.

## Goals / Non-Goals
- **Goals:**
  - Run the existing UI in any local browser alongside the Electron window
  - Full feature parity: sessions, terminals, search, plans, memory, stats, settings, IDE emulation (diffs/file opens)
  - Single process — the web server lives in the Electron main process, sharing all state
  - Localhost-only binding for security
  - Configurable port with sane default (8081)

- **Non-Goals:**
  - Remote/multi-user access (no auth, no CORS, no TLS)
  - Standalone Node.js entry point without Electron (future consideration)
  - Server-side rendering or a separate frontend build

## Decisions

### 1. Shared process, not a separate server
- **Decision:** The Express server runs inside the Electron main process.
- **Why:** All state (SQLite, PTY map, MCP servers, worker thread) is already in-process. Sharing avoids IPC duplication, data sync issues, and extra process management.
- **Alternative:** Separate `node web.js` process. Rejected because it would require cross-process state sharing or duplicating the data layer.

### 2. WebSocket for bidirectional communication
- **Decision:** One WebSocket endpoint (`/ws`) handles all push events and terminal I/O. REST endpoints handle request-response calls.
- **Why:** Terminal streaming and MCP events are inherently push-based. REST is simpler for one-shot queries. This mirrors the existing IPC split (`invoke` = REST, `on`/`send` = WebSocket).
- **Alternative:** Pure WebSocket RPC for everything. Rejected — adds unnecessary framing complexity for simple queries.

### 3. Client-side API shim
- **Decision:** A `web-api-shim.js` script that defines `window.api` with the same interface as `preload.js`, but backed by `fetch()` + WebSocket.
- **Why:** Zero changes to `app.js` or `file-panel.js`. The renderer doesn't know or care which transport it's using.
- **Detection:** `index.html` checks `if (!window.api)` after the preload would have run. If absent (browser context), it loads the shim script.

### 4. REST route naming convention
- **Decision:** Each `ipcMain.handle('some-action', ...)` maps to `POST /api/some-action`. Arguments are JSON body. Response is JSON.
- **Why:** 1:1 mapping makes the web server trivial to implement and maintain — loop over the same handler functions.

### 5. Terminal multiplexing over WebSocket
- **Decision:** Terminal data is multiplexed on the shared WebSocket with message framing: `{ type: "terminal-data", sessionId, data }`. Input is sent the same way: `{ type: "terminal-input", sessionId, data }`.
- **Why:** Avoids opening a WebSocket per terminal. The existing PTY map in `main.js` is reused — the web server just adds another consumer alongside the Electron `webContents.send` path.

## Risks / Trade-offs
- **Security:** Binding to `127.0.0.1` only. No auth needed for local-only access, but a user could expose the port. Mitigated by refusing to bind to `0.0.0.0` — the server rejects non-loopback bind addresses.
- **Port conflicts:** Default 8081 may be in use. Mitigated by clear error messaging and configurable port in settings.
- **Resource usage:** Minimal — Express adds negligible overhead since it just serves static files and proxies to existing handlers.

## Open Questions
- None currently blocking. Future: standalone mode without Electron (separate entry point) could be added later by extracting the web server module.
