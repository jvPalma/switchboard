## 1. Web Server Module
- [x] 1.1 Create `web-server.js` — Express server factory: takes port, host, and handler dependencies; returns start/stop functions
- [x] 1.2 Serve `public/` as static files and `node_modules/@xterm/xterm/css/xterm.css` for the xterm stylesheet
- [x] 1.3 Add WebSocket upgrade handling on the same HTTP server (using `ws` — already a dependency)
- [x] 1.4 Validate host is loopback (`127.0.0.1` / `::1`) on startup; reject other bind addresses

## 2. REST API Routes
- [x] 2.1 Create route registration that maps each `ipcMain.handle` channel to `POST /api/<channel>` with JSON body/response
- [x] 2.2 Extract IPC handler logic from `main.js` into reusable functions that both IPC and REST can call
- [x] 2.3 Handle file-dialog routes (`browse-folder`) — return an error in web mode since Electron dialogs aren't available in browser

## 3. WebSocket Protocol
- [x] 3.1 Define message framing: `{ type, sessionId?, ...payload }` for all push events
- [x] 3.2 Relay terminal data (`terminal-data`) from PTY to WebSocket clients
- [x] 3.3 Accept terminal input (`terminal-input`, `terminal-resize`, `close-terminal`) from WebSocket clients
- [x] 3.4 Relay push events: `session-detected`, `process-exited`, `progress-state`, `terminal-notification`, `session-forked`, `projects-changed`, `status-update`
- [x] 3.5 Relay MCP bridge events: `mcp-open-diff`, `mcp-open-file`, `mcp-close-all-diffs`, `mcp-close-tab`
- [x] 3.6 Accept MCP diff responses from WebSocket clients (`mcp-diff-response`)

## 4. Client-Side API Shim
- [x] 4.1 Create `public/web-api-shim.js` implementing the full `window.api` interface from `preload.js`
- [x] 4.2 Request-response methods (`getProjects`, `search`, etc.) use `fetch('POST /api/<channel>')`
- [x] 4.3 Fire-and-forget methods (`sendInput`, `resizeTerminal`, `closeTerminal`) send over WebSocket
- [x] 4.4 Listener methods (`onTerminalData`, `onMcpOpenDiff`, etc.) register WebSocket message handlers
- [x] 4.5 Add WebSocket auto-reconnect with backoff
- [x] 4.6 Update `public/index.html` to conditionally load shim: `if (!window.api)` after preload

## 5. Settings & Lifecycle
- [x] 5.1 Add settings keys: `webServerEnabled` (boolean, default `true`), `webServerPort` (number, default `8081`)
- [x] 5.2 Start web server on `app.ready` if enabled; stop on `app.quit`
- [x] 5.3 Add "Web Server" section to Global Settings UI — toggle + port input
- [x] 5.4 Log web server URL to console and show in status bar on startup
- [x] 5.5 Handle port-in-use errors gracefully with user-visible notification

## 6. Testing
- [x] 6.1 Add test for web server startup and static file serving
- [x] 6.2 Add test for REST API route mapping (at least `get-projects`, `search`)
- [x] 6.3 Add test for WebSocket message framing (terminal relay round-trip)
- [x] 6.4 Add test for loopback-only bind validation
- [ ] 6.5 Manual smoke test: open `http://127.0.0.1:8081` in browser alongside Electron window, verify full functionality
