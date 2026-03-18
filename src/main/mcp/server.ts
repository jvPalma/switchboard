import { WebSocketServer } from 'ws';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import { handleMessage, type McpServerEntry, type Logger } from './tools';
import type { McpWindowProxy } from '@main/broadcast';

const IDE_DIR = path.join(os.homedir(), '.claude', 'ide');

// sessionId → ServerEntry
const servers = new Map<string, McpServerEntry>();

// ── Helpers ──────────────────────────────────────────────────────

function ensureIdeDir(): void {
  fs.mkdirSync(IDE_DIR, { recursive: true });
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close(() => reject(new Error('Could not determine port')));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ── Public API ───────────────────────────────────────────────────

export async function startMcpServer(
  sessionId: string,
  workspaceFolders: string[],
  mainWindow: McpWindowProxy,
  log: Logger,
): Promise<{ port: number; authToken: string }> {
  ensureIdeDir();

  const port = await findFreePort();
  const authToken = crypto.randomUUID();

  const wss = new WebSocketServer({
    port,
    host: '127.0.0.1',
    handleProtocols: (protocols) => {
      if (protocols.has('mcp')) return 'mcp';
      return false;
    },
  });

  const lockFilePath = path.join(IDE_DIR, `${port}.lock`);
  const lockData = JSON.stringify({
    pid: process.pid,
    workspaceFolders,
    ideName: 'Switchboard',
    transport: 'ws',
    runningInWindows: false,
    authToken,
  });
  fs.writeFileSync(lockFilePath, lockData, 'utf8');

  const entry: McpServerEntry = {
    sessionId,
    wss,
    port,
    authToken,
    lockFilePath,
    mainWindow,
    ws: null,
    pendingDiffs: new Map(),
  };

  wss.on('connection', (ws, req) => {
    const headerAuth = req.headers['x-claude-code-ide-authorization'];
    if (headerAuth !== authToken) {
      log.warn(`[mcp] session=${sessionId} rejected connection: bad auth`);
      ws.close(4001, 'Unauthorized');
      return;
    }

    log.info(`[mcp] session=${sessionId} CLI connected on port ${port}`);

    // Close any previous connection
    if (entry.ws) {
      try { entry.ws.close(); } catch { /* ignore */ }
    }
    entry.ws = ws;

    ws.on('message', (data) => {
      handleMessage(entry, data.toString(), log);
    });

    ws.on('close', () => {
      if (entry.ws === ws) entry.ws = null;
      log.debug(`[mcp] session=${sessionId} CLI disconnected`);
    });

    ws.on('error', (err) => {
      log.debug(`[mcp] session=${sessionId} ws error: ${err.message}`);
    });
  });

  wss.on('error', (err) => {
    log.error(`[mcp] session=${sessionId} server error: ${err.message}`);
  });

  servers.set(sessionId, entry);
  log.info(`[mcp] session=${sessionId} server started on port ${port}`);

  return { port, authToken };
}

export function shutdownMcpServer(sessionId: string): void {
  const entry = servers.get(sessionId);
  if (!entry) return;

  // Resolve all pending diffs
  for (const [, pending] of entry.pendingDiffs) {
    pending.resolve({ action: 'accept' });
  }
  entry.pendingDiffs.clear();

  if (entry.ws) {
    try { entry.ws.close(); } catch { /* ignore */ }
  }

  try { entry.wss.close(); } catch { /* ignore */ }
  try { fs.unlinkSync(entry.lockFilePath); } catch { /* ignore */ }

  servers.delete(sessionId);
}

export function shutdownAll(): void {
  for (const sessionId of servers.keys()) {
    shutdownMcpServer(sessionId);
  }
}

export function resolvePendingDiff(
  sessionId: string,
  diffId: string,
  action: string,
  editedContent: string | null,
): void {
  const entry = servers.get(sessionId);
  if (!entry) return;

  const pending = entry.pendingDiffs.get(diffId);
  if (!pending) return;

  entry.pendingDiffs.delete(diffId);
  pending.resolve({ action, content: editedContent });
}

export function rekeyMcpServer(oldId: string, newId: string): void {
  const entry = servers.get(oldId);
  if (!entry) return;

  servers.delete(oldId);
  entry.sessionId = newId;
  servers.set(newId, entry);
}

export function cleanStaleLockFiles(log: Logger): void {
  try {
    ensureIdeDir();
    const files = fs.readdirSync(IDE_DIR);
    for (const file of files) {
      if (!file.endsWith('.lock')) continue;
      const lockPath = path.join(IDE_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (data.ideName === 'Switchboard' && data.pid === process.pid) {
          fs.unlinkSync(lockPath);
          log.info(`[mcp] Cleaned stale lock file: ${file}`);
        }
      } catch {
        // Not our lock file or can't parse — skip
      }
    }
  } catch {
    // IDE dir may not exist yet
  }
}
