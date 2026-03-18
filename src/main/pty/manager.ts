import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as pty from 'node-pty';
import log from 'electron-log';
import { PROJECTS_DIR, MAX_BUFFER_SIZE } from '@main/constants';
import { getMainWindow, broadcastToWeb, sendToRenderer, sendStatus, createMcpWindowProxy } from '@main/broadcast';
import { cleanPtyEnv, TERMINAL_ENV } from './env';
import { startMcpServer, shutdownMcpServer, rekeyMcpServer } from '@main/mcp/server';

// TODO: import from @shared/types when available
export interface SessionOptions {
  type?: 'terminal';
  forkFrom?: string;
  dangerouslySkipPermissions?: boolean;
  permissionMode?: string;
  worktree?: boolean;
  worktreeName?: string;
  chrome?: boolean;
  addDirs?: string;
  preLaunchCmd?: string;
  mcpEmulation?: boolean;
}

export interface PtySession {
  pty: pty.IPty;
  rendererAttached: boolean;
  exited: boolean;
  outputBuffer: string[];
  outputBufferSize: number;
  altScreen: boolean;
  projectPath: string;
  firstResize: boolean;
  projectFolder: string | null;
  knownJsonlFiles: Set<string> | null;
  sessionSlug: string | null;
  isPlainTerminal: boolean;
  forkFrom: string | null;
  mcpServer: { port: number; authToken: string } | null;
  realSessionId?: string;
  _suppressBuffer?: boolean;
}

interface SpawnResult {
  ok: boolean;
  reattached?: boolean;
  mcpActive?: boolean;
  error?: string;
}

// Active PTY sessions
export const activeSessions = new Map<string, PtySession>();

// ── Reattach to existing session ──────────────────────────────────

function reattachSession(sessionId: string): SpawnResult {
  const session = activeSessions.get(sessionId);
  if (!session) return { ok: false, error: 'session not found' };

  const mainWindow = getMainWindow();
  session.rendererAttached = true;
  session.firstResize = !session.isPlainTerminal;

  // If TUI is in alternate screen mode, send escape to switch into it
  if (session.altScreen && !session.isPlainTerminal) {
    sendToRenderer('terminal-data', sessionId, '\x1b[?1049h');
  }

  // Send buffered output for reattach
  for (const chunk of session.outputBuffer) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', sessionId, chunk);
    }
    broadcastToWeb('terminal-data', sessionId, chunk);
  }

  if (!session.isPlainTerminal) {
    // Hide cursor after buffer replay — the live PTY stream or resize nudge
    // will re-show it at the correct position
    sendToRenderer('terminal-data', sessionId, '\x1b[?25l');
  }

  return { ok: true, reattached: true, mcpActive: !!session.mcpServer };
}

// ── Spawn new PTY ─────────────────────────────────────────────────

export async function spawnTerminal(
  sessionId: string,
  projectPath: string,
  isNew: boolean,
  sessionOptions?: SessionOptions,
): Promise<SpawnResult> {
  const mainWindow = getMainWindow();
  if (!mainWindow) return { ok: false, error: 'no window' };

  // Reattach to existing session
  if (activeSessions.has(sessionId)) {
    return reattachSession(sessionId);
  }

  if (!fs.existsSync(projectPath)) {
    return { ok: false, error: `project directory no longer exists: ${projectPath}` };
  }

  const shellPath = process.env.SHELL || '/bin/zsh';
  const isPlainTerminal = sessionOptions?.type === 'terminal';

  let knownJsonlFiles = new Set<string>();
  let sessionSlug: string | null = null;
  let projectFolder: string | null = null;

  if (!isPlainTerminal) {
    projectFolder = projectPath.replace(/[/_]/g, '-').replace(/^-/, '-');
    const claudeProjectDir = path.join(PROJECTS_DIR, projectFolder);
    if (fs.existsSync(claudeProjectDir)) {
      try {
        knownJsonlFiles = new Set(
          fs.readdirSync(claudeProjectDir).filter(f => f.endsWith('.jsonl'))
        );
      } catch { /* ignore */ }
    }

    if (!isNew) {
      try {
        const jsonlPath = path.join(PROJECTS_DIR, projectFolder, sessionId + '.jsonl');
        const head = fs.readFileSync(jsonlPath, 'utf8').slice(0, 8000);
        const firstLines = head.split('\n').filter(Boolean);
        for (const line of firstLines) {
          const entry = JSON.parse(line);
          if (entry.slug) { sessionSlug = entry.slug as string; break; }
        }
      } catch { /* ignore */ }
    }
  }

  let ptyProcess: pty.IPty;
  let mcpServer: { port: number; authToken: string } | null = null;

  try {
    if (isPlainTerminal) {
      const claudeShim = 'claude() { echo "\\033[33mTo start a Claude session, use the + button in the sidebar.\\033[0m"; return 1; }; export -f claude 2>/dev/null;';
      ptyProcess = pty.spawn(shellPath, ['-l', '-i'], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: projectPath,
        env: {
          ...cleanPtyEnv,
          ...TERMINAL_ENV,
          CLAUDECODE: '1',
          ENV: claudeShim,
          BASH_ENV: claudeShim,
        },
      });
      // For zsh, ENV/BASH_ENV don't apply — write the function after shell starts
      setTimeout(() => {
        try {
          ptyProcess.write(claudeShim + ' clear\n');
        } catch { /* ignore */ }
      }, 300);
    } else {
      let claudeCmd: string;
      if (sessionOptions?.forkFrom) {
        claudeCmd = `claude --resume "${sessionOptions.forkFrom}" --fork-session`;
      } else if (isNew) {
        claudeCmd = `claude --session-id "${sessionId}"`;
      } else {
        claudeCmd = `claude --resume "${sessionId}"`;
      }

      if (sessionOptions) {
        if (sessionOptions.dangerouslySkipPermissions) {
          claudeCmd += ' --dangerously-skip-permissions';
        } else if (sessionOptions.permissionMode) {
          claudeCmd += ` --permission-mode "${sessionOptions.permissionMode}"`;
        }
        if (sessionOptions.worktree) {
          claudeCmd += ' --worktree';
          if (sessionOptions.worktreeName) {
            claudeCmd += ` "${sessionOptions.worktreeName}"`;
          }
        }
        if (sessionOptions.chrome) {
          claudeCmd += ' --chrome';
        }
        if (sessionOptions.addDirs) {
          const dirs = sessionOptions.addDirs.split(',').map(d => d.trim()).filter(Boolean);
          for (const dir of dirs) {
            claudeCmd += ` --add-dir "${dir}"`;
          }
        }
      }

      if (sessionOptions?.preLaunchCmd) {
        claudeCmd = sessionOptions.preLaunchCmd + ' ' + claudeCmd;
      }

      // Start MCP server for IDE emulation
      if (sessionOptions?.mcpEmulation !== false) {
        try {
          mcpServer = await startMcpServer(sessionId, [projectPath], createMcpWindowProxy(), log);
          claudeCmd += ' --ide';
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`[mcp] Failed to start MCP server for ${sessionId}: ${message}`);
        }
      }

      const ptyEnv: Record<string, string | undefined> = {
        ...cleanPtyEnv,
        ...TERMINAL_ENV,
      };
      if (mcpServer) {
        ptyEnv.CLAUDE_CODE_SSE_PORT = String(mcpServer.port);
      }

      ptyProcess = pty.spawn(shellPath, ['-l', '-i', '-c', claudeCmd], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: projectPath,
        env: ptyEnv,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Error spawning PTY: ${message}` };
  }

  const session: PtySession = {
    pty: ptyProcess, rendererAttached: true, exited: false,
    outputBuffer: [], outputBufferSize: 0, altScreen: false,
    projectPath, firstResize: true,
    projectFolder, knownJsonlFiles, sessionSlug,
    isPlainTerminal, forkFrom: sessionOptions?.forkFrom || null,
    mcpServer,
  };
  activeSessions.set(sessionId, session);

  setupOnData(ptyProcess, session, sessionId);
  setupOnExit(ptyProcess, session, sessionId);

  if (sessionOptions?.forkFrom) {
    log.info(`[fork-spawn] tempId=${sessionId} forkFrom=${sessionOptions.forkFrom} folder=${projectFolder} knownFiles=${knownJsonlFiles.size}`);
  }

  return { ok: true, reattached: false, mcpActive: !!mcpServer };
}

// ── PTY data handler ──────────────────────────────────────────────

function setupOnData(ptyProcess: pty.IPty, session: PtySession, sessionId: string): void {
  ptyProcess.onData(data => {
    const currentId = session.realSessionId || sessionId;

    // Log OSC sequences
    if (data.includes('\x1b]')) {
      const oscMatches = data.matchAll(/\x1b\](\d+);([^\x07\x1b]*)(?:\x07|\x1b\\)/g);
      for (const m of oscMatches) {
        const code = m[1];
        const payload = m[2]?.slice(0, 120);
        if (code !== '9') log.debug(`[OSC ${code}] session=${currentId} payload="${payload}"`);
      }

      // Parse iTerm2 OSC 9 notification
      const notifMatch = data.match(/\x1b\]9;([^\x07\x1b]*)(?:\x07|\x1b\\)/);
      if (notifMatch && !notifMatch[1]?.startsWith('4;')) {
        const message = notifMatch[1];
        log.debug(`[OSC 9] session=${currentId} message="${message}"`);
        sendToRenderer('terminal-notification', currentId, message);
      }

      // Parse iTerm2 OSC 9;4 progress sequences
      const progressMatch = data.match(/\x1b\]9;4;(\d)(?:;(\d+))?(?:\x07|\x1b\\)/);
      if (progressMatch) {
        const state = parseInt(progressMatch[1]!, 10);
        const percent = progressMatch[2] ? parseInt(progressMatch[2], 10) : -1;
        log.debug(`[OSC 9;4] session=${currentId} state=${state} percent=${percent}`);
        sendToRenderer('progress-state', currentId, state, percent);
      }
    }

    // Standalone BEL
    if (data.includes('\x07') && !data.includes('\x1b]')) {
      log.info(`[BEL] session=${currentId}`);
    }

    // Track alternate screen mode
    if (data.includes('\x1b[?')) {
      if (data.includes('\x1b[?1049h') || data.includes('\x1b[?47h')) {
        session.altScreen = true;
        log.info(`[altscreen] session=${currentId} ON`);
      }
      if (data.includes('\x1b[?1049l') || data.includes('\x1b[?47l')) {
        session.altScreen = false;
        log.info(`[altscreen] session=${currentId} OFF`);
      }
    }

    // Buffer output (skip resize-triggered redraws for plain terminals)
    if (!session._suppressBuffer) {
      session.outputBuffer.push(data);
      session.outputBufferSize += data.length;
      while (session.outputBufferSize > MAX_BUFFER_SIZE && session.outputBuffer.length > 1) {
        session.outputBufferSize -= session.outputBuffer.shift()!.length;
      }
    }

    sendToRenderer('terminal-data', currentId, data);
  });
}

// ── PTY exit handler ──────────────────────────────────────────────

function setupOnExit(ptyProcess: pty.IPty, session: PtySession, sessionId: string): void {
  ptyProcess.onExit(() => {
    session.exited = true;
    const mcpId = session.realSessionId || sessionId;
    shutdownMcpServer(mcpId);
    session.mcpServer = null;

    const realId = session.realSessionId || sessionId;
    const mainWindow = getMainWindow();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process-exited', realId);
      if (realId !== sessionId && activeSessions.has(sessionId)) {
        mainWindow.webContents.send('process-exited', sessionId);
      }
    }
    broadcastToWeb('process-exited', realId);
    if (realId !== sessionId && activeSessions.has(sessionId)) {
      broadcastToWeb('process-exited', sessionId);
    }
    activeSessions.delete(realId);
    activeSessions.delete(sessionId);
  });
}

// ── Terminal input/resize/close ───────────────────────────────────

export function handleTerminalInput(sessionId: string, data: string): void {
  const session = activeSessions.get(sessionId);
  if (session && !session.exited) {
    session.pty.write(data);
  }
}

export function handleTerminalResize(sessionId: string, cols: number, rows: number): void {
  const session = activeSessions.get(sessionId);
  if (!session || session.exited) return;

  // Suppress buffering during resize for plain terminals
  if (session.isPlainTerminal) session._suppressBuffer = true;

  session.pty.resize(cols, rows);

  if (session.isPlainTerminal) {
    setTimeout(() => { session._suppressBuffer = false; }, 200);
  }

  // First resize: nudge to force TUI redraw on reattach (skip for plain terminals)
  if (session.firstResize && !session.isPlainTerminal) {
    session.firstResize = false;
    setTimeout(() => {
      try {
        session.pty.resize(cols + 1, rows);
        setTimeout(() => {
          try { session.pty.resize(cols, rows); } catch { /* ignore */ }
        }, 50);
      } catch { /* ignore */ }
    }, 50);
  }
}

export function handleCloseTerminal(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.rendererAttached = false;
    if (session.exited) {
      activeSessions.delete(sessionId);
    }
  }
}

export function killSession(sessionId: string): { ok: boolean; error?: string } {
  const session = activeSessions.get(sessionId);
  if (!session || session.exited) return { ok: false, error: 'not running' };
  session.pty.kill();
  return { ok: true };
}

export function killAllSessions(): void {
  for (const [id, session] of activeSessions) {
    if (!session.exited) {
      try { session.pty.kill(); } catch { /* ignore */ }
    }
    activeSessions.delete(id);
  }
}

export function getActiveSessions(): string[] {
  const active: string[] = [];
  for (const [sessionId, session] of activeSessions) {
    if (!session.exited) active.push(sessionId);
  }
  return active;
}

export function getActiveTerminals(): { sessionId: string; projectPath: string }[] {
  const terminals: { sessionId: string; projectPath: string }[] = [];
  for (const [sessionId, session] of activeSessions) {
    if (!session.exited && session.isPlainTerminal) {
      terminals.push({ sessionId, projectPath: session.projectPath });
    }
  }
  return terminals;
}

// ── PTY warmup ────────────────────────────────────────────────────

export function warmupPty(): void {
  sendStatus('Warming up terminal\u2026', 'active');
  try {
    const shellPath = process.env.SHELL || '/bin/zsh';
    const p = pty.spawn(shellPath, ['-l', '-i', '-c', 'claude'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: { ...cleanPtyEnv, ...TERMINAL_ENV },
    });
    p.onExit(() => {
      sendStatus('Terminal ready', 'done');
      setTimeout(() => sendStatus(''), 3000);
    });
    setTimeout(() => { try { p.kill(); } catch { /* ignore */ } }, 5000);
  } catch {
    sendStatus('');
  }
}

// ── WebSocket message handler (for web server) ───────────────────

export function handleWebSocketMessage(msg: {
  type: string;
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  diffId?: string;
  action?: string;
  editedContent?: string;
}): void {
  const { resolvePendingDiff } = require('@main/mcp/server') as typeof import('@main/mcp/server');
  const session = msg.sessionId ? activeSessions.get(msg.sessionId) : null;
  switch (msg.type) {
    case 'terminal-input':
      if (session && !session.exited && msg.data) session.pty.write(msg.data);
      break;
    case 'terminal-resize':
      if (session && !session.exited && msg.cols && msg.rows) session.pty.resize(msg.cols, msg.rows);
      break;
    case 'close-terminal':
      if (session && !session.exited) {
        try { session.pty.kill(); } catch { /* ignore */ }
      }
      break;
    case 'mcp-diff-response':
      if (msg.sessionId && msg.diffId && msg.action) {
        resolvePendingDiff(msg.sessionId, msg.diffId, msg.action, msg.editedContent || null);
      }
      break;
  }
}
