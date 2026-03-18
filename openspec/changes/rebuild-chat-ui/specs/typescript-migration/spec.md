## ADDED Requirements

### Requirement: TypeScript Build System
The project SHALL use esbuild to compile TypeScript source files into JavaScript bundles for the main process, renderer process, and web entry point.

#### Scenario: Build produces working bundles
- **WHEN** `npm run build:ts` is executed
- **THEN** esbuild produces `dist/main.js`, `dist/renderer.js`, `dist/web.js`, and `dist/preload.js`
- **AND** the Electron app starts from the dist bundles
- **AND** the web server starts from `dist/web.js`

#### Scenario: Type checking catches errors
- **WHEN** `npm run typecheck` is executed
- **THEN** tsc runs in noEmit mode with strict settings
- **AND** type errors are reported without producing output files

### Requirement: Modular Source Structure
All source code SHALL be organized in a `src/` directory with domain-driven subdirectories: `main/`, `renderer/`, `shared/`, `web/`, `db/`, `workers/`.

#### Scenario: Main process is split into modules
- **GIVEN** the current `main.js` is a 1753-line monolith
- **WHEN** the migration is complete
- **THEN** the main process entry point imports from `src/main/ipc/`, `src/main/pty/`, `src/main/cache/`, and `src/main/mcp/`
- **AND** no single file exceeds 300 lines

#### Scenario: Renderer is split into views
- **GIVEN** the current `public/app.js` is a 3267-line monolith
- **WHEN** the migration is complete
- **THEN** each view (sidebar, terminal, plans, memory, stats, settings, file-panel) is a separate module in `src/renderer/views/`
- **AND** shared components live in `src/renderer/components/`

### Requirement: Shared Type Definitions
The project SHALL define TypeScript types for all IPC channels, session data shapes, `.jsonl` entry formats, and settings in `src/shared/types/`.

#### Scenario: IPC channels are type-safe
- **WHEN** a handler is registered for an IPC channel
- **THEN** the channel name, argument types, and return type are enforced by TypeScript
- **AND** the preload bridge and web shim use the same type definitions

#### Scenario: .jsonl entries are typed
- **WHEN** a `.jsonl` line is parsed
- **THEN** it is discriminated into a union type by its `type` field
- **AND** tool_use blocks are further discriminated by tool `name`

### Requirement: Backward Compatibility
Both `npm start` (Electron) and `npm run start:web` (standalone web) SHALL continue to work after the migration.

#### Scenario: Electron mode works
- **WHEN** `npm start` is executed
- **THEN** the Electron app launches with all existing functionality
- **AND** all existing tests pass

#### Scenario: Web mode works
- **WHEN** `npm run start:web` is executed
- **THEN** the web server starts on the configured port
- **AND** the browser UI is fully functional
