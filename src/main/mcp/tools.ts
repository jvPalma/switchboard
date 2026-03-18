import * as fs from 'fs';
import * as crypto from 'crypto';
import type { McpWindowProxy } from '@main/broadcast';
import type { WebSocket, WebSocketServer } from 'ws';

// TODO: import from @shared/types when available
export interface PendingDiff {
  resolve: (result: DiffResult) => void;
  rpcId: number | string;
  tabName: string;
}

export interface DiffResult {
  action: string;
  content?: string | null;
}

export interface McpServerEntry {
  sessionId: string;
  wss: WebSocketServer;
  port: number;
  authToken: string;
  lockFilePath: string;
  mainWindow: McpWindowProxy;
  ws: WebSocket | null;
  pendingDiffs: Map<string, PendingDiff>;
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string }>;
    required?: string[];
  };
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'openDiff',
    description: 'Open a diff view for a file edit',
    inputSchema: {
      type: 'object',
      properties: {
        old_file_path: { type: 'string' },
        new_file_path: { type: 'string' },
        new_file_contents: { type: 'string' },
        tab_name: { type: 'string' },
      },
      required: ['old_file_path', 'new_file_path', 'new_file_contents', 'tab_name'],
    },
  },
  {
    name: 'openFile',
    description: 'Open a file in the editor',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        preview: { type: 'boolean' },
        startText: { type: 'string' },
        endText: { type: 'string' },
        selectToEndOfLine: { type: 'boolean' },
        makeFrontmost: { type: 'boolean' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'close_tab',
    description: 'Close a specific diff tab by name',
    inputSchema: {
      type: 'object',
      properties: { tab_name: { type: 'string' } },
      required: ['tab_name'],
    },
  },
  {
    name: 'closeAllDiffTabs',
    description: 'Close all open diff tabs',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'getDiagnostics',
    description: 'Get diagnostics for a file',
    inputSchema: {
      type: 'object',
      properties: { uri: { type: 'string' } },
    },
  },
];

// ── JSON-RPC helpers ──────────────────────────────────────────────

function rpcResult(id: number | string, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function rpcError(id: number | string, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

export function sendResult(entry: McpServerEntry, id: number | string, result: unknown): void {
  if (entry.ws && entry.ws.readyState === 1) {
    entry.ws.send(rpcResult(id, result));
  }
}

export function sendError(entry: McpServerEntry, id: number | string, code: number, message: string): void {
  if (entry.ws && entry.ws.readyState === 1) {
    entry.ws.send(rpcError(id, code, message));
  }
}

// ── Tool call dispatch ────────────────────────────────────────────

export async function handleToolCall(
  entry: McpServerEntry,
  rpcId: number | string,
  params: { name?: string; arguments?: Record<string, unknown> } | undefined,
  log: Logger,
): Promise<void> {
  const toolName = params?.name;
  const args = (params?.arguments || {}) as Record<string, string | boolean | undefined>;

  switch (toolName) {
    case 'openDiff':
      return handleOpenDiff(entry, rpcId, args, log);
    case 'openFile':
      return handleOpenFile(entry, rpcId, args, log);
    case 'close_tab':
      return handleCloseTab(entry, rpcId, args, log);
    case 'closeAllDiffTabs':
      return handleCloseAllDiffTabs(entry, rpcId, log);
    case 'getDiagnostics':
      return handleGetDiagnostics(entry, rpcId);
    default:
      sendError(entry, rpcId, -32602, `Unknown tool: ${toolName}`);
  }
}

async function handleOpenDiff(
  entry: McpServerEntry,
  rpcId: number | string,
  args: Record<string, string | boolean | undefined>,
  log: Logger,
): Promise<void> {
  const { old_file_path, new_file_contents, tab_name } = args as {
    old_file_path: string;
    new_file_contents: string;
    tab_name: string;
  };

  let oldContent = '';
  try {
    oldContent = fs.readFileSync(old_file_path, 'utf8');
  } catch {
    log.debug(`[mcp] Could not read ${old_file_path} — treating as new file`);
  }

  const diffId = crypto.randomUUID();

  const diffPromise = new Promise<DiffResult>((resolve) => {
    entry.pendingDiffs.set(diffId, { resolve, rpcId, tabName: tab_name });
  });

  if (entry.mainWindow && !entry.mainWindow.isDestroyed()) {
    entry.mainWindow.webContents.send('mcp-open-diff', entry.sessionId, diffId, {
      oldFilePath: old_file_path,
      oldContent,
      newContent: new_file_contents,
      tabName: tab_name,
    });
  }

  const result = await diffPromise;

  if (result.action === 'accept-edited') {
    sendResult(entry, rpcId, {
      content: [
        { type: 'text', text: 'FILE_SAVED' },
        { type: 'text', text: result.content },
      ],
    });
  } else if (result.action === 'accept') {
    sendResult(entry, rpcId, {
      content: [{ type: 'text', text: 'TAB_CLOSED' }],
    });
  } else {
    sendResult(entry, rpcId, {
      content: [{ type: 'text', text: 'DIFF_REJECTED' }],
    });
  }
}

async function handleOpenFile(
  entry: McpServerEntry,
  rpcId: number | string,
  args: Record<string, string | boolean | undefined>,
  log: Logger,
): Promise<void> {
  const { filePath, preview, startText, endText } = args as {
    filePath: string;
    preview?: boolean;
    startText?: string;
    endText?: string;
  };

  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.debug(`[mcp] Could not read ${filePath}: ${message}`);
  }

  if (entry.mainWindow && !entry.mainWindow.isDestroyed()) {
    entry.mainWindow.webContents.send('mcp-open-file', entry.sessionId, {
      filePath,
      content,
      preview: preview ?? false,
      startText: startText || '',
      endText: endText || '',
    });
  }

  sendResult(entry, rpcId, {
    content: [{ type: 'text', text: 'ok' }],
  });
}

async function handleCloseTab(
  entry: McpServerEntry,
  rpcId: number | string,
  args: Record<string, string | boolean | undefined>,
  log: Logger,
): Promise<void> {
  const { tab_name } = args as { tab_name: string };
  log.debug(`[mcp] session=${entry.sessionId} close_tab: ${tab_name}`);

  for (const [diffId, pending] of entry.pendingDiffs) {
    if (pending.tabName === tab_name) {
      entry.pendingDiffs.delete(diffId);
      pending.resolve({ action: 'accept' });

      if (entry.mainWindow && !entry.mainWindow.isDestroyed()) {
        entry.mainWindow.webContents.send('mcp-close-tab', entry.sessionId, diffId);
      }
      break;
    }
  }

  sendResult(entry, rpcId, {
    content: [{ type: 'text', text: 'ok' }],
  });
}

async function handleCloseAllDiffTabs(
  entry: McpServerEntry,
  rpcId: number | string,
  log: Logger,
): Promise<void> {
  log.debug(`[mcp] session=${entry.sessionId} closeAllDiffTabs`);

  for (const [, pending] of entry.pendingDiffs) {
    pending.resolve({ action: 'accept' });
  }
  entry.pendingDiffs.clear();

  if (entry.mainWindow && !entry.mainWindow.isDestroyed()) {
    entry.mainWindow.webContents.send('mcp-close-all-diffs', entry.sessionId);
  }

  sendResult(entry, rpcId, {
    content: [{ type: 'text', text: 'ok' }],
  });
}

async function handleGetDiagnostics(
  entry: McpServerEntry,
  rpcId: number | string,
): Promise<void> {
  sendResult(entry, rpcId, {
    content: [{ type: 'text', text: '[]' }],
  });
}

// ── JSON-RPC message handler ──────────────────────────────────────

export function handleMessage(entry: McpServerEntry, raw: string, log: Logger): void {
  let msg: { id?: number | string | null; method?: string; params?: Record<string, unknown> };
  try {
    msg = JSON.parse(raw);
  } catch {
    log.warn('[mcp] Received invalid JSON');
    return;
  }

  const { id, method, params } = msg;

  // Notifications (no id) — fire-and-forget
  if (id === undefined || id === null) {
    if (method === 'notifications/initialized') {
      log.info(`[mcp] session=${entry.sessionId} CLI initialized`);
    }
    return;
  }

  // Requests (have id) — must respond
  switch (method) {
    case 'initialize':
      sendResult(entry, id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'Switchboard', version: '1.0.0' },
      });
      return;

    case 'tools/list':
      sendResult(entry, id, { tools: MCP_TOOLS });
      return;

    case 'tools/call':
      handleToolCall(
        entry,
        id,
        params as { name?: string; arguments?: Record<string, unknown> },
        log,
      );
      return;

    default:
      log.debug(`[mcp] session=${entry.sessionId} unhandled method: ${method}`);
      sendError(entry, id, -32601, `Method not found: ${method}`);
  }
}
