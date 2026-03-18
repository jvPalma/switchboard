// Session, Project, and DB-layer types derived from db.js schema
// and the merged shapes returned to the renderer.

/** Row from `session_meta` table — user-controlled metadata. */
export interface SessionMeta {
  sessionId: string;
  name: string | null;
  starred: number; // 0 | 1
  archived: number; // 0 | 1
}

/** Row from `session_cache` table — parsed session data. */
export interface CachedSession {
  sessionId: string;
  folder: string;
  projectPath: string | null;
  summary: string | null;
  firstPrompt: string | null;
  created: string | null; // ISO 8601
  modified: string | null; // ISO 8601
  messageCount: number;
  slug: string | null;
}

/** Row from `cache_meta` table — per-folder mtime tracking. */
export interface CacheMeta {
  folder: string;
  projectPath: string | null;
  indexMtimeMs: number;
}

/** Row from `search_map` table. */
export interface SearchMapRow {
  rowid: number;
  id: string;
  type: string;
  folder: string | null;
}

/** FTS search result returned by `searchByType`. */
export interface SearchResult {
  id: string;
  snippet: string;
}

/**
 * Merged session object sent to the renderer.
 * Combines CachedSession fields with SessionMeta fields.
 */
export interface Session {
  sessionId: string;
  summary: string | null;
  firstPrompt: string | null;
  created: string | null;
  modified: string | null;
  messageCount: number;
  projectPath: string | null;
  slug: string | null;
  name: string | null;
  starred: number;
  archived: number;
}

/** Project group as returned by `get-projects` handler. */
export interface Project {
  folder: string;
  projectPath: string;
  sessions: Session[];
}

/** Plan file metadata returned by `get-plans`. */
export interface Plan {
  filename: string;
  title: string;
  modified: string; // ISO 8601
}

/** Memory entry returned by `get-memories`. */
export interface Memory {
  type: 'global' | 'project' | 'auto';
  label: string;
  filename: string;
  filePath: string;
  modified: string; // ISO 8601
}

/** Active terminal descriptor returned by `get-active-terminals`. */
export interface ActiveTerminal {
  sessionId: string;
  projectPath: string;
}

/** Options passed when opening a terminal via `open-terminal`. */
export interface SessionOptions {
  type?: 'terminal';
  forkFrom?: string;
  permissionMode?: string | null;
  dangerouslySkipPermissions?: boolean;
  worktree?: boolean;
  worktreeName?: string;
  chrome?: boolean;
  preLaunchCmd?: string;
  addDirs?: string;
  mcpEmulation?: boolean;
}

/** Result of `open-terminal` handler. */
export type OpenTerminalResult =
  | { ok: true; reattached: boolean; mcpActive: boolean }
  | { ok: false; error: string };

/** MCP diff data sent to renderer via `mcp-open-diff`. */
export interface McpDiffData {
  oldFilePath: string;
  oldContent: string;
  newContent: string;
  tabName: string;
}

/** MCP file data sent to renderer via `mcp-open-file`. */
export interface McpFileData {
  filePath: string;
  content: string;
  preview: boolean;
  startText: string;
  endText: string;
}

/** Diff response action from renderer → main. */
export type DiffAction = 'accept' | 'accept-edited' | 'reject';

/** Result of a scan-projects worker folder read. */
export interface ScannedFolder {
  folder: string;
  projectPath: string;
  sessions: ScannedSession[];
  indexMtimeMs: number;
}

/** Session data as produced by the scan-projects worker. */
export interface ScannedSession {
  sessionId: string;
  folder: string;
  projectPath: string;
  summary: string;
  firstPrompt: string;
  created: string; // ISO 8601
  modified: string; // ISO 8601
  messageCount: number;
  textContent: string;
  slug: string | null;
  customTitle: string | null;
}

/** Worker → main progress message. */
export interface WorkerProgress {
  type: 'progress';
  text: string;
}

/** Worker → main final result. */
export type WorkerResult =
  | { ok: true; results: ScannedFolder[] }
  | { ok: false; error: string };

/** FTS search entry for upsert. */
export interface SearchEntry {
  id: string;
  type: string;
  folder: string | null;
  title: string;
  body: string;
}
