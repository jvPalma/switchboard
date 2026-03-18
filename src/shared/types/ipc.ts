// Typed IPC channel map — the contract between main and renderer processes.
// Derived from ipcMain.handle / registerHandler calls in main.js and preload.js.

import type {
  ActiveTerminal,
  DiffAction,
  McpDiffData,
  McpFileData,
  Memory,
  OpenTerminalResult,
  Plan,
  Project,
  SearchResult,
  Session,
  SessionOptions,
} from './session';
import type { EffectiveSettings } from './settings';
import type { JsonlEntry } from './jsonl';

// ── Invoke channels (request → response) ────────────────────────────
// ipcRenderer.invoke(channel, ...args) → Promise<ReturnType>

export interface IpcInvokeChannelMap {
  // Projects & sessions
  'get-projects': {
    args: [showArchived?: boolean];
    return: Project[];
  };
  'get-active-sessions': {
    args: [];
    return: string[];
  };
  'get-active-terminals': {
    args: [];
    return: ActiveTerminal[];
  };
  'open-terminal': {
    args: [sessionId: string, projectPath: string, isNew: boolean, sessionOptions?: SessionOptions];
    return: OpenTerminalResult;
  };
  'stop-session': {
    args: [sessionId: string];
    return: { ok: true } | { ok: false; error: string };
  };
  'toggle-star': {
    args: [sessionId: string];
    return: { starred: number };
  };
  'rename-session': {
    args: [sessionId: string, name: string];
    return: { name: string | null };
  };
  'archive-session': {
    args: [sessionId: string, archived: boolean];
    return: { archived: number };
  };
  'read-session-jsonl': {
    args: [sessionId: string];
    return: { entries: JsonlEntry[] } | { error: string };
  };
  'tail-session-jsonl': {
    args: [sessionId: string];
    return: { ok: true } | { error: string };
  };
  'stop-tail-session-jsonl': {
    args: [sessionId?: string];
    return: { ok: true };
  };

  // Plans
  'get-plans': {
    args: [];
    return: Plan[];
  };
  'read-plan': {
    args: [filename: string];
    return: { content: string; filePath: string };
  };
  'save-plan': {
    args: [filePath: string, content: string];
    return: { ok: true } | { ok: false; error: string };
  };

  // Stats & memories
  'get-stats': {
    args: [];
    return: unknown;
  };
  'get-memories': {
    args: [];
    return: Memory[];
  };
  'read-memory': {
    args: [filePath: string];
    return: string;
  };

  // Search
  'search': {
    args: [type: string, query: string];
    return: SearchResult[];
  };

  // Settings
  'get-setting': {
    args: [key: string];
    return: unknown;
  };
  'set-setting': {
    args: [key: string, value: unknown];
    return: { ok: true };
  };
  'delete-setting': {
    args: [key: string];
    return: { ok: true };
  };
  'get-effective-settings': {
    args: [projectPath?: string];
    return: EffectiveSettings;
  };

  // File management
  'browse-folder': {
    args: [];
    return: string | null;
  };
  'add-project': {
    args: [projectPath: string];
    return: { ok: true; folder: string; projectPath: string } | { error: string };
  };
  'remove-project': {
    args: [projectPath: string];
    return: { ok: true } | { error: string };
  };
  'open-external': {
    args: [url: string];
    return: void;
  };
  'read-file-for-panel': {
    args: [filePath: string];
    return: { ok: true; content: string } | { ok: false; error: string };
  };

  // Auto-updater
  'updater-check': {
    args: [];
    return: unknown;
  };
  'updater-download': {
    args: [];
    return: unknown;
  };
  'updater-install': {
    args: [];
    return: void;
  };
}

// ── Send channels (fire-and-forget, renderer → main) ────────────────
// ipcRenderer.send(channel, ...args)

export interface IpcSendChannelMap {
  'terminal-input': {
    args: [sessionId: string, data: string];
  };
  'terminal-resize': {
    args: [sessionId: string, cols: number, rows: number];
  };
  'close-terminal': {
    args: [sessionId: string];
  };
  'mcp-diff-response': {
    args: [sessionId: string, diffId: string, action: DiffAction, editedContent: string | null];
  };
}

// ── Push channels (main → renderer) ─────────────────────────────────
// mainWindow.webContents.send(channel, ...args)

export interface IpcPushChannelMap {
  'terminal-data': {
    args: [sessionId: string, data: string];
  };
  'session-detected': {
    args: [tempId: string, realId: string];
  };
  'process-exited': {
    args: [sessionId: string, exitCode: number];
  };
  'progress-state': {
    args: [sessionId: string, state: number, percent: number];
  };
  'terminal-notification': {
    args: [sessionId: string, message: string];
  };
  'session-forked': {
    args: [oldId: string, newId: string];
  };
  'projects-changed': {
    args: [];
  };
  'status-update': {
    args: [text: string, type?: string];
  };
  'updater-event': {
    args: [type: string, data: unknown];
  };

  // MCP bridge events
  'mcp-open-diff': {
    args: [sessionId: string, diffId: string, data: McpDiffData];
  };
  'mcp-open-file': {
    args: [sessionId: string, data: McpFileData];
  };
  'mcp-close-all-diffs': {
    args: [sessionId: string];
  };
  'mcp-close-tab': {
    args: [sessionId: string, diffId: string];
  };

  // Session tailing
  'tail-session-jsonl': {
    args: [sessionId: string, newLines: string[]];
  };
}

// ── Utility types for typed IPC wrappers ─────────────────────────────

/** Extract the channel names for each direction. */
export type InvokeChannel = keyof IpcInvokeChannelMap;
export type SendChannel = keyof IpcSendChannelMap;
export type PushChannel = keyof IpcPushChannelMap;

/** Extract args and return type for a given invoke channel. */
export type InvokeArgs<C extends InvokeChannel> = IpcInvokeChannelMap[C]['args'];
export type InvokeReturn<C extends InvokeChannel> = IpcInvokeChannelMap[C]['return'];

/** Extract args for a given send channel. */
export type SendArgs<C extends SendChannel> = IpcSendChannelMap[C]['args'];

/** Extract args for a given push channel. */
export type PushArgs<C extends PushChannel> = IpcPushChannelMap[C]['args'];
