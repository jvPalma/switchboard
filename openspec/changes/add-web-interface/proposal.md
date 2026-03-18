# Change: Add local web interface (dual-mode)

## Why
Switchboard currently requires Electron to run. Users who want to access their sessions from a browser (e.g., on a remote dev server, or simply preferring a browser tab over a desktop app) have no option. Adding a local web server alongside the Electron window lets both coexist in the same process, sharing the same data layer, PTY pool, and MCP bridge.

## What Changes
- Start an Express HTTP server inside the Electron main process, bound to `127.0.0.1` on a configurable port (default `8081`)
- Serve the existing `public/` renderer files as static assets
- Expose an HTTP + WebSocket API that mirrors every `ipcMain.handle` / `ipcMain.on` handler
- Ship a thin client-side shim (`web-api-shim.js`) that implements the `window.api` contract over HTTP/WebSocket so the renderer works identically in both Electron and browser contexts
- Relay terminal I/O and all push events (MCP diffs, notifications, updater) over WebSocket
- Add a "Web Server" toggle in Global Settings with port configuration
- Server lifecycle is tied to the Electron app — starts on app ready, stops on app quit

## Impact
- Affected specs: `web-interface` (new)
- Affected code: `main.js` (server startup/shutdown, settings), new `web-server.js` module, new `web-api-shim.js` in `public/`, minor changes to `public/index.html` (conditional script loading)
- No changes to the existing IPC path — Electron mode is unaffected
- No changes to `db.js`, `mcp-bridge.js`, `folder-index-state.js`, or `workers/`
