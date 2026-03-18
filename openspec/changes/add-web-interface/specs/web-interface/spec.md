## ADDED Requirements

### Requirement: Local Web Server
The system SHALL start an HTTP server bound to `127.0.0.1` on a configurable port (default `8081`) when the web server setting is enabled. The server SHALL serve the renderer UI as static files, allowing access from any local browser.

#### Scenario: Server starts on app launch
- **WHEN** the application starts and `webServerEnabled` is `true`
- **THEN** an HTTP server starts on `127.0.0.1:<configured port>`
- **AND** the renderer UI is accessible at `http://127.0.0.1:<port>/`

#### Scenario: Server disabled
- **WHEN** the application starts and `webServerEnabled` is `false`
- **THEN** no HTTP server is started
- **AND** the Electron window functions normally

#### Scenario: Loopback-only binding
- **WHEN** the server starts
- **THEN** it SHALL bind only to loopback addresses (`127.0.0.1` or `::1`)
- **AND** it SHALL refuse to bind to non-loopback addresses

#### Scenario: Port conflict
- **WHEN** the configured port is already in use
- **THEN** the system SHALL display a user-visible error notification
- **AND** the Electron window SHALL continue to function normally

### Requirement: REST API
The system SHALL expose an HTTP API at `/api/<channel>` that mirrors every `ipcMain.handle` channel. Each endpoint SHALL accept POST requests with a JSON body and return JSON responses.

#### Scenario: Request-response parity
- **WHEN** a web client sends `POST /api/get-projects` with body `{ "args": [false] }`
- **THEN** the server SHALL return the same data as `ipcRenderer.invoke('get-projects', false)`

#### Scenario: Electron-only operations
- **WHEN** a web client calls an endpoint that requires Electron APIs (e.g., `browse-folder`)
- **THEN** the server SHALL return an error response indicating the operation is unavailable in web mode

### Requirement: WebSocket Communication
The system SHALL provide a WebSocket endpoint at `/ws` for bidirectional real-time communication. Terminal I/O, push events, and MCP bridge events SHALL be multiplexed over this connection using JSON message framing with a `type` field.

#### Scenario: Terminal data relay
- **WHEN** a PTY produces output for a session
- **THEN** the server SHALL send `{ "type": "terminal-data", "sessionId": "<id>", "data": "<output>" }` to all connected WebSocket clients

#### Scenario: Terminal input
- **WHEN** a web client sends `{ "type": "terminal-input", "sessionId": "<id>", "data": "<input>" }`
- **THEN** the server SHALL write the data to the corresponding PTY

#### Scenario: MCP diff events
- **WHEN** the MCP bridge opens a diff for a session
- **THEN** the server SHALL send `{ "type": "mcp-open-diff", "sessionId": "<id>", "diffId": "<id>", "data": {...} }` to connected WebSocket clients

#### Scenario: MCP diff response
- **WHEN** a web client sends `{ "type": "mcp-diff-response", "sessionId": "<id>", "diffId": "<id>", "action": "accept|reject|accept-edited", "editedContent": "..." }`
- **THEN** the server SHALL resolve the pending diff in the MCP bridge

#### Scenario: Auto-reconnect
- **WHEN** the WebSocket connection drops
- **THEN** the client shim SHALL automatically reconnect with exponential backoff

### Requirement: Client API Shim
The system SHALL provide a `web-api-shim.js` script that implements the full `window.api` interface defined in `preload.js`. The renderer SHALL load this shim when `window.api` is not already defined (i.e., when running in a browser without Electron's preload).

#### Scenario: Transparent transport switching
- **WHEN** the renderer loads in a browser (no Electron preload)
- **THEN** `web-api-shim.js` is loaded and defines `window.api`
- **AND** all renderer code (`app.js`, `file-panel.js`) works without modification

#### Scenario: Electron mode unaffected
- **WHEN** the renderer loads inside Electron
- **THEN** `window.api` is defined by the preload script
- **AND** the web API shim is NOT loaded
- **AND** no HTTP requests are made to the web server for API calls

### Requirement: Web Server Configuration
The system SHALL provide user-configurable settings for the web server through the Global Settings UI.

#### Scenario: Toggle web server
- **WHEN** the user disables the web server in Global Settings
- **THEN** the server stops and the port is released
- **WHEN** the user re-enables it
- **THEN** the server starts on the configured port

#### Scenario: Change port
- **WHEN** the user changes the port in Global Settings
- **THEN** the server restarts on the new port
- **AND** the previous port is released
