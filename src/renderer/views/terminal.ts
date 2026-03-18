// Terminal view — manages xterm.js instances, IPC listeners for terminal data,
// session lifecycle (open / launch / fork), progress indicators, and polling.

import type { Session, SessionOptions, Project } from '@shared/types';
import type { SwitchboardApi } from '../api/types';
import {
  openSessions,
  activeSessionId,
  setActiveSessionId,
  pendingSessions,
  sessionMap,
  cachedProjects,
  cachedAllProjects,
  activePtyIds,
  setActivePtyIds,
  unreadSessions,
  attentionSessions,
  lastActivityTime,
  sessionProgressState,
  unreadNoiseRe,
  redrawScrollUntil,
  setRedrawScrollUntil,
  TERMINAL_THEME,
  type OpenSessionEntry,
} from '../state';
import { cleanDisplayName } from '../utils';

// ── Cross-view callbacks (injected via initTerminal) ──────────────────

export interface TerminalCallbacks {
  refreshSidebar: (opts?: { resort?: boolean }) => void;
  loadProjects: (opts?: { resort?: boolean }) => Promise<void>;
  setSessionMcpActive: (sessionId: string, active: boolean) => void;
  rekeyFilePanelState: (oldId: string, newId: string) => void;
  hidePlanViewer: () => void;
  switchPanel: (sessionId: string | null) => void;
}

let callbacks: TerminalCallbacks;

// ── Cached DOM elements ───────────────────────────────────────────────

let terminalsEl: HTMLElement;
let placeholder: HTMLElement;
let terminalHeader: HTMLElement;
let terminalHeaderName: HTMLElement;
let terminalHeaderId: HTMLElement;
let terminalHeaderStatus: HTMLElement;
let terminalHeaderPtyTitle: HTMLElement | null;
let terminalStopBtn: HTMLElement;
let terminalRestartBtn: HTMLElement;

// ── Escape-sequence constants ─────────────────────────────────────────

const ESC_SYNC_START = '\x1b[?2026h';
const ESC_SYNC_END = '\x1b[?2026l';
const ESC_SCREEN_CLEAR = '\x1b[2J';
const ESC_ALT_SCREEN_ON = '\x1b[?1049h';

// ── Typed accessor for window.api ─────────────────────────────────────

const api = (): SwitchboardApi => window.api;

// ── Helpers ───────────────────────────────────────────────────────────

const setActiveSession = (id: string | null): void => {
  setActiveSessionId(id);
  callbacks.switchPanel(id);
};

const isAtBottom = (terminal: Terminal): boolean => {
  const buf = terminal.buffer.active;
  return buf.viewportY >= buf.baseY;
};

const markUnread = (sessionId: string, data: string): void => {
  if (sessionId === activeSessionId) return;
  if (unreadNoiseRe.test(data)) return;
  if (!unreadSessions.has(sessionId)) {
    unreadSessions.add(sessionId);
    const item = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (item) item.classList.add('has-unread');
  }
};

const clearUnread = (sessionId: string): void => {
  unreadSessions.delete(sessionId);
  const item = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
  if (item) item.classList.remove('has-unread');
};

// ── Key bindings ──────────────────────────────────────────────────────
// Shift+Enter -> kitty protocol (CSI 13;2u) so Claude Code treats it as
// newline, not submit.  Two layers:
//   1. attachCustomKeyEventHandler returning false — blocks xterm pipeline
//   2. preventDefault on capture-phase keydown — prevents browser \n

const setupTerminalKeyBindings = (
  terminal: Terminal,
  container: HTMLElement,
  getSessionId: () => string,
): void => {
  terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.type === 'keydown') {
        api().sendInput(getSessionId(), '\x1b[13;2u');
      }
      return false;
    }
    return true;
  });

  const textarea = container.querySelector('.xterm-helper-textarea');
  if (textarea) {
    textarea.addEventListener('keydown', ((e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
      }
    }) as EventListener, { capture: true });
  }
};

// ── Link handler factory ──────────────────────────────────────────────
// file:// links open in the file panel; everything else goes to the OS.

type OpenFileInPanelFn = (sessionId: string, path: string) => void;

const tryOpenFileInPanel = (sessionId: string, uri: string): void => {
  try {
    const path = decodeURIComponent(new URL(uri).pathname);
    const fn = (window as unknown as Record<string, unknown>)['openFileInPanel'];
    if (typeof fn === 'function') {
      (fn as OpenFileInPanelFn)(sessionId, path);
    }
  } catch { /* ignore malformed URIs */ }
};

const makeLinkHandler = (sessionId: string) => ({
  activate: (_event: MouseEvent, uri: string) => {
    if (uri.startsWith('file://')) {
      tryOpenFileInPanel(sessionId, uri);
    } else {
      api().openExternal(uri);
    }
  },
  allowNonHttpProtocols: true,
});

const makeWebLinksHandler = (sessionId: string) => (_event: MouseEvent, url: string): void => {
  if (url.startsWith('file://')) {
    tryOpenFileInPanel(sessionId, url);
  } else {
    api().openExternal(url);
  }
};

// ── Shared terminal creation ──────────────────────────────────────────
// Extracts the repeated pattern from openSession, launchNewSession, and
// launchTerminalSession into a single helper.

interface CreateTerminalOpts {
  sessionId: string;
  session: Session & { type?: string };
  container: HTMLElement;
  /** Getter for session ID — accounts for fork re-keying */
  getSessionId: () => string;
}

const createTerminalInstance = (opts: CreateTerminalOpts): OpenSessionEntry => {
  const { sessionId, session, container, getSessionId } = opts;

  const terminal = new Terminal({
    fontSize: 12,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
    theme: TERMINAL_THEME,
    cursorBlink: true,
    scrollback: 10000,
    convertEol: true,
    linkHandler: makeLinkHandler(sessionId),
  });

  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon.WebLinksAddon(makeWebLinksHandler(sessionId)));
  terminal.open(container);
  fitAddon.fit();

  const entry: OpenSessionEntry = { terminal, element: container, fitAddon, session, closed: false };
  openSessions.set(sessionId, entry);

  // Wire up terminal input via IPC
  terminal.onData((data: string) => {
    api().sendInput(getSessionId(), data);
  });
  setupTerminalKeyBindings(terminal, container, getSessionId);

  terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
    api().resizeTerminal(getSessionId(), cols, rows);
  });

  terminal.onTitleChange((title: string) => {
    entry.ptyTitle = title;
    if (activeSessionId === getSessionId()) updatePtyTitle();
  });

  terminal.onBell(() => {
    markUnread(getSessionId(), '\x07');
  });

  return entry;
};

// ── Terminal header ───────────────────────────────────────────────────

export const showTerminalHeader = (session: Session): void => {
  const displayName = cleanDisplayName(session.name || session.summary);
  terminalHeaderName.textContent = displayName;
  terminalHeaderId.textContent = session.sessionId;
  terminalHeader.style.display = '';
  updateTerminalHeader();
  updateProgressIndicators(session.sessionId);
};

export const updateTerminalHeader = (): void => {
  if (!activeSessionId) return;
  const running = activePtyIds.has(activeSessionId);
  terminalHeaderStatus.className = running ? 'running' : 'stopped';
  terminalHeaderStatus.textContent = running ? 'Running' : 'Stopped';
  terminalStopBtn.style.display = running ? '' : 'none';
  updatePtyTitle();
};

export const updatePtyTitle = (): void => {
  if (!activeSessionId || !terminalHeaderPtyTitle) return;
  const entry = openSessions.get(activeSessionId);
  const title = entry?.ptyTitle || '';
  terminalHeaderPtyTitle.textContent = title;
  terminalHeaderPtyTitle.style.display = title ? '' : 'none';
};

// ── Progress indicators ───────────────────────────────────────────────

export const updateProgressIndicators = (sessionId: string): void => {
  const info = sessionProgressState.get(sessionId);
  const state = info?.state ?? 0;

  // Update sidebar item
  const item = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
  if (item) {
    item.classList.toggle('is-busy', state === 3);
    item.classList.toggle('has-progress', state === 1);
    item.classList.toggle('has-error', state === 2);
  }

  // Update terminal header progress bar if this is the active session
  if (sessionId === activeSessionId) {
    const bar = document.getElementById('terminal-progress-bar');
    if (!bar) return;
    bar.className = 'progress-state-' + state;
    if (state === 1) {
      bar.style.setProperty('--progress', (info?.percent || 0) + '%');
    }
  }
};

// ── Running indicators ────────────────────────────────────────────────

export const updateRunningIndicators = (): void => {
  document.querySelectorAll('.session-item').forEach((item: Element) => {
    const el = item as HTMLElement;
    const id = el.dataset.sessionId;
    if (!id) return;
    const running = activePtyIds.has(id);
    el.classList.toggle('has-running-pty', running);
    if (!running) {
      el.classList.remove('has-unread', 'needs-attention', 'is-busy', 'has-progress', 'has-error');
      unreadSessions.delete(id);
      attentionSessions.delete(id);
      sessionProgressState.delete(id);
    }
    const dot = el.querySelector('.session-status-dot');
    if (dot) dot.classList.toggle('running', running);
  });

  // Update slug group running dots
  document.querySelectorAll('.slug-group').forEach((group: Element) => {
    const hasRunning = group.querySelector('.session-item.has-running-pty') !== null;
    const dot = group.querySelector('.slug-group-dot');
    if (dot) dot.classList.toggle('running', hasRunning);
  });
};

// ── Polling ───────────────────────────────────────────────────────────

export const pollActiveSessions = async (): Promise<void> => {
  try {
    const ids = await api().getActiveSessions();
    setActivePtyIds(new Set(ids));
    updateRunningIndicators();
    updateTerminalHeader();
  } catch { /* swallow — poll will retry */ }
};

// ── resolveDefaultSessionOptions ──────────────────────────────────────

export const resolveDefaultSessionOptions = async (
  project: Pick<Project, 'projectPath'>,
): Promise<SessionOptions> => {
  const effective = await api().getEffectiveSettings(project.projectPath);
  const options: SessionOptions = {};
  if (effective.dangerouslySkipPermissions) {
    options.dangerouslySkipPermissions = true;
  } else if (effective.permissionMode) {
    options.permissionMode = effective.permissionMode;
  }
  if (effective.worktree) {
    options.worktree = true;
    if (effective.worktreeName) options.worktreeName = effective.worktreeName;
  }
  if (effective.chrome) options.chrome = true;
  if (effective.preLaunchCmd) options.preLaunchCmd = effective.preLaunchCmd;
  if (effective.addDirs) options.addDirs = effective.addDirs;
  if (effective.mcpEmulation === false) options.mcpEmulation = false;
  return options;
};

// ── Prepare UI for showing a session ──────────────────────────────────
// Shared by openSession, launchNewSession, and launchTerminalSession.

const prepareSessionUI = (sessionId: string, session: Session): void => {
  document.querySelectorAll('.session-item.active').forEach((el: Element) => el.classList.remove('active'));
  const item = document.querySelector(`[data-session-id="${sessionId}"]`);
  if (item) item.classList.add('active');
  document.querySelectorAll('.terminal-container').forEach((el: Element) => el.classList.remove('visible'));
  placeholder.style.display = 'none';
  callbacks.hidePlanViewer();
  setActiveSession(sessionId);
  showTerminalHeader(session);
};

// ── openSession ───────────────────────────────────────────────────────
// Attach to an existing session or create a new terminal for it.

export const openSession = async (session: Session & { type?: string }): Promise<void> => {
  const { sessionId, projectPath } = session;

  // Update sidebar active state
  document.querySelectorAll('.session-item.active').forEach((el: Element) => el.classList.remove('active'));
  const item = document.querySelector(`[data-session-id="${sessionId}"]`);
  if (item) item.classList.add('active');

  // Hide all terminal containers and plan viewer
  document.querySelectorAll('.terminal-container').forEach((el: Element) => el.classList.remove('visible'));
  placeholder.style.display = 'none';
  callbacks.hidePlanViewer();
  setActiveSession(sessionId);
  clearUnread(sessionId);
  attentionSessions.delete(sessionId);
  const attentionItem = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
  if (attentionItem) attentionItem.classList.remove('needs-attention');
  showTerminalHeader(session);

  if (openSessions.has(sessionId)) {
    const entry = openSessions.get(sessionId)!;
    if (entry.closed) {
      api().closeTerminal(sessionId);
      entry.terminal.dispose();
      entry.element.remove();
      openSessions.delete(sessionId);
      // Terminal sessions re-spawn fresh
      if (session.type === 'terminal') {
        launchTerminalSession({ projectPath: session.projectPath! });
        return;
      }
    } else {
      entry.element.classList.add('visible');
      entry.terminal.focus();
      // Defer fit — the container just went from display:none to display:block,
      // so the viewport has no dimensions yet.
      requestAnimationFrame(() => {
        entry.fitAddon.fit();
        if (isAtBottom(entry.terminal)) {
          requestAnimationFrame(() => entry.terminal.scrollToBottom());
        }
      });
      return;
    }
  }

  // Create new terminal
  const container = document.createElement('div');
  container.className = 'terminal-container visible';
  terminalsEl.appendChild(container);

  const entry = createTerminalInstance({
    sessionId,
    session,
    container,
    getSessionId: () => entry.session.sessionId,
  });

  // Open terminal in main process with resolved default settings
  const resumeOptions = await resolveDefaultSessionOptions({ projectPath: projectPath! });
  const result = await api().openTerminal(sessionId, projectPath!, false, resumeOptions);
  if (!result.ok) {
    entry.terminal.write(`\r\nError: ${result.error}\r\n`);
    entry.closed = true;
    return;
  }
  callbacks.setSessionMcpActive(sessionId, !!result.mcpActive);

  // Send initial resize
  api().resizeTerminal(sessionId, entry.terminal.cols, entry.terminal.rows);

  entry.terminal.focus();
  pollActiveSessions();
};

// ── launchNewSession ──────────────────────────────────────────────────

export const launchNewSession = async (
  project: Pick<Project, 'projectPath'>,
  sessionOptions?: SessionOptions | null,
): Promise<void> => {
  const sessionId = crypto.randomUUID();
  const projectPath = project.projectPath;
  const session: Session & { type?: string } = {
    sessionId,
    summary: 'New session',
    firstPrompt: '',
    projectPath,
    name: null,
    starred: 0,
    archived: 0,
    messageCount: 0,
    modified: new Date().toISOString(),
    created: new Date().toISOString(),
    slug: null,
  };

  // Track as pending (no .jsonl yet)
  const folder = projectPath.replace(/[/_]/g, '-').replace(/^-/, '-');
  pendingSessions.set(sessionId, { session, projectPath, folder });

  // Inject into cached project data so it appears in sidebar immediately
  sessionMap.set(sessionId, session);
  for (const projList of [cachedProjects, cachedAllProjects]) {
    let proj = projList.find(p => p.projectPath === projectPath);
    if (!proj) {
      proj = { folder, projectPath, sessions: [] };
      projList.unshift(proj);
    }
    proj.sessions.unshift(session);
  }
  callbacks.refreshSidebar();

  prepareSessionUI(sessionId, session);

  // Create terminal
  const container = document.createElement('div');
  container.className = 'terminal-container visible';
  terminalsEl.appendChild(container);

  const entry = createTerminalInstance({
    sessionId,
    session,
    container,
    getSessionId: () => session.sessionId,
  });

  // Open terminal in main process with session options
  const result = await api().openTerminal(sessionId, projectPath, true, sessionOptions || null);
  if (!result.ok) {
    entry.terminal.write(`\r\nError: ${result.error}\r\n`);
    entry.closed = true;
    return;
  }
  callbacks.setSessionMcpActive(sessionId, !!result.mcpActive);

  // Send initial resize
  api().resizeTerminal(sessionId, entry.terminal.cols, entry.terminal.rows);

  entry.terminal.focus();
  pollActiveSessions();
};

// ── launchTerminalSession ─────────────────────────────────────────────

export const launchTerminalSession = async (
  project: Pick<Project, 'projectPath'>,
): Promise<void> => {
  const sessionId = crypto.randomUUID();
  const projectPath = project.projectPath;
  const session: Session & { type?: string } = {
    sessionId,
    summary: 'Terminal',
    firstPrompt: '',
    projectPath,
    name: null,
    starred: 0,
    archived: 0,
    messageCount: 0,
    modified: new Date().toISOString(),
    created: new Date().toISOString(),
    slug: null,
    type: 'terminal',
  };

  // Track as pending
  const folder = projectPath.replace(/[/_]/g, '-').replace(/^-/, '-');
  pendingSessions.set(sessionId, { session, projectPath, folder });

  // Inject into cached project data
  sessionMap.set(sessionId, session);
  for (const projList of [cachedProjects, cachedAllProjects]) {
    let proj = projList.find(p => p.projectPath === projectPath);
    if (!proj) {
      proj = { folder, projectPath, sessions: [] };
      projList.unshift(proj);
    }
    proj.sessions.unshift(session);
  }
  callbacks.refreshSidebar();

  prepareSessionUI(sessionId, session);

  // Create terminal
  const container = document.createElement('div');
  container.className = 'terminal-container visible';
  terminalsEl.appendChild(container);

  const entry = createTerminalInstance({
    sessionId,
    session,
    container,
    getSessionId: () => session.sessionId,
  });

  const result = await api().openTerminal(sessionId, projectPath, true, { type: 'terminal' });
  if (!result.ok) {
    entry.terminal.write(`\r\nError: ${result.error}\r\n`);
    entry.closed = true;
    return;
  }

  api().resizeTerminal(sessionId, entry.terminal.cols, entry.terminal.rows);
  entry.terminal.focus();
  pollActiveSessions();
};

// ── forkSession ───────────────────────────────────────────────────────

export const forkSession = async (
  session: Session,
  project: Pick<Project, 'projectPath'>,
): Promise<void> => {
  const options = await resolveDefaultSessionOptions(project);
  options.forkFrom = session.sessionId;
  launchNewSession(project, options);
};

// ── IPC listener wiring ───────────────────────────────────────────────

const wireIpcListeners = (): void => {
  // --- Terminal data ---
  api().onTerminalData((sessionId: string, data: string) => {
    const entry = openSessions.get(sessionId);
    if (entry) {
      const wasAtBottom = isAtBottom(entry.terminal);
      if (data.includes(ESC_SCREEN_CLEAR) || data.includes(ESC_ALT_SCREEN_ON)) {
        setRedrawScrollUntil(Date.now() + 1000);
      }
      const forceScroll = Date.now() < redrawScrollUntil;
      entry.terminal.write(data, () => {
        if (sessionId !== activeSessionId) return;
        if (wasAtBottom || forceScroll) {
          entry.terminal.scrollToBottom();
        }
      });
    }
    // Don't mark activity for synchronized output (TUI repaints)
    const isSyncRedraw = data.startsWith(ESC_SYNC_START) && data.endsWith(ESC_SYNC_END);
    if (!isSyncRedraw) {
      if (!unreadNoiseRe.test(data)) lastActivityTime.set(sessionId, new Date());
      markUnread(sessionId, data);
    }
  });

  // --- Session detected (temp ID -> real ID) ---
  api().onSessionDetected((tempId: string, realId: string) => {
    const entry = openSessions.get(tempId);
    if (!entry) return;

    entry.session.sessionId = realId;
    if (activeSessionId === tempId) setActiveSession(realId);

    // Re-key in openSessions
    openSessions.delete(tempId);
    openSessions.set(realId, entry);

    terminalHeaderId.textContent = realId;
    terminalHeaderName.textContent = 'New session';

    // Refresh sidebar to show the new session, then select it
    callbacks.loadProjects().then(() => {
      const item = document.querySelector(`[data-session-id="${realId}"]`);
      if (item) {
        document.querySelectorAll('.session-item.active').forEach((el: Element) => el.classList.remove('active'));
        item.classList.add('active');
      }
    });
    pollActiveSessions();
  });

  // --- Session forked ---
  api().onSessionForked((oldId: string, newId: string) => {
    const entry = openSessions.get(oldId);
    if (!entry) return;

    entry.session.sessionId = newId;
    if (activeSessionId === oldId) setActiveSession(newId);

    openSessions.delete(oldId);
    openSessions.set(newId, entry);

    // Re-key file panel state for the new session ID
    callbacks.rekeyFilePanelState(oldId, newId);

    // Clean up pending session so it doesn't duplicate the real .jsonl entry
    pendingSessions.delete(oldId);
    sessionMap.delete(oldId);
    sessionMap.set(newId, entry.session);

    terminalHeaderId.textContent = newId;

    callbacks.loadProjects().then(() => {
      const item = document.querySelector(`[data-session-id="${newId}"]`);
      if (item) {
        document.querySelectorAll('.session-item.active').forEach((el: Element) => el.classList.remove('active'));
        item.classList.add('active');
        const summary = item.querySelector('.session-summary');
        if (summary) terminalHeaderName.textContent = summary.textContent;
      }
    });
    pollActiveSessions();
  });

  // --- Process exited ---
  api().onProcessExited((sessionId: string, _exitCode: number) => {
    const entry = openSessions.get(sessionId);
    const session = sessionMap.get(sessionId) as (Session & { type?: string }) | undefined;
    if (entry) {
      entry.closed = true;
    }

    // Clean up terminal UI on exit
    if (entry) {
      api().closeTerminal(sessionId);
      entry.terminal.dispose();
      entry.element.remove();
      openSessions.delete(sessionId);
    }
    if (activeSessionId === sessionId) {
      setActiveSession(null);
      terminalHeader.style.display = 'none';
      placeholder.style.display = '';
    }

    // Plain terminal sessions: remove from sidebar entirely (ephemeral)
    if (session?.type === 'terminal') {
      pendingSessions.delete(sessionId);
      for (const projList of [cachedProjects, cachedAllProjects]) {
        for (const proj of projList) {
          proj.sessions = proj.sessions.filter(s => s.sessionId !== sessionId);
        }
      }
      sessionMap.delete(sessionId);
      callbacks.refreshSidebar();
      pollActiveSessions();
      return;
    }

    // Clean up no-op pending sessions (never created a .jsonl)
    if (pendingSessions.has(sessionId)) {
      pendingSessions.delete(sessionId);
      for (const projList of [cachedProjects, cachedAllProjects]) {
        for (const proj of projList) {
          proj.sessions = proj.sessions.filter(s => s.sessionId !== sessionId);
        }
      }
      sessionMap.delete(sessionId);
      callbacks.refreshSidebar();
    }

    pollActiveSessions();
  });

  // --- Terminal notifications (iTerm2 OSC 9 — "needs attention") ---
  api().onTerminalNotification((sessionId: string, message: string) => {
    if (/attention|approval|permission|needs your/i.test(message) && sessionId !== activeSessionId) {
      attentionSessions.add(sessionId);
      const item = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
      if (item) item.classList.add('needs-attention');
    }

    // Show in header if active
    if (sessionId === activeSessionId && terminalHeaderPtyTitle) {
      terminalHeaderPtyTitle.textContent = message;
      terminalHeaderPtyTitle.style.display = '';
    }
  });

  // --- Progress state (iTerm2 OSC 9;4) ---
  // state: 0=clear, 1=progress%, 2=error, 3=indeterminate(busy), 4=warning
  api().onProgressState((sessionId: string, state: number, percent: number) => {
    sessionProgressState.set(sessionId, { state, percent });
    updateProgressIndicators(sessionId);
  });
};

// ── Terminal header controls ──────────────────────────────────────────

const wireHeaderControls = (): void => {
  terminalStopBtn.addEventListener('click', async () => {
    if (!activeSessionId) return;
    const sid = activeSessionId;
    await api().stopSession(sid);
    activePtyIds.delete(sid);
    setActiveSession(null);
    terminalHeader.style.display = 'none';
    placeholder.style.display = '';
    callbacks.refreshSidebar();
  });

  terminalRestartBtn.addEventListener('click', () => {
    if (!activeSessionId) return;
    const entry = openSessions.get(activeSessionId);
    if (!entry) return;
    api().closeTerminal(activeSessionId);
    entry.terminal.dispose();
    entry.element.remove();
    openSessions.delete(activeSessionId);
    openSession(entry.session);
  });
};

// ── Window resize handler ─────────────────────────────────────────────

const wireResizeHandler = (): void => {
  window.addEventListener('resize', () => {
    if (activeSessionId && openSessions.has(activeSessionId)) {
      const entry = openSessions.get(activeSessionId)!;
      entry.fitAddon.fit();
    }
  });
};

// ── Xterm warm-up ─────────────────────────────────────────────────────
// Pre-instantiate an off-screen terminal so the first real open is fast.

const warmUpXterm = (): void => {
  setTimeout(() => {
    const warmEl = document.createElement('div');
    warmEl.style.cssText = 'position:absolute;left:-9999px;width:400px;height:200px;';
    document.body.appendChild(warmEl);
    const warmTerm = new Terminal({ cols: 80, rows: 10 });
    const warmFit = new FitAddon.FitAddon();
    warmTerm.loadAddon(warmFit);
    warmTerm.open(warmEl);
    warmTerm.write(' ');
    requestAnimationFrame(() => {
      warmTerm.dispose();
      warmEl.remove();
    });
  }, 100);
};

// ── Polling interval ──────────────────────────────────────────────────

const startPolling = (): void => {
  setInterval(pollActiveSessions, 3000);
};

// ── Initialization ────────────────────────────────────────────────────

export const initTerminal = (cb: TerminalCallbacks): void => {
  callbacks = cb;

  // Cache DOM elements
  terminalsEl = document.getElementById('terminals')!;
  placeholder = document.getElementById('placeholder')!;
  terminalHeader = document.getElementById('terminal-header')!;
  terminalHeaderName = document.getElementById('terminal-header-name')!;
  terminalHeaderId = document.getElementById('terminal-header-id')!;
  terminalHeaderStatus = document.getElementById('terminal-header-status')!;
  terminalHeaderPtyTitle = document.getElementById('terminal-header-pty-title');
  terminalStopBtn = document.getElementById('terminal-stop-btn')!;
  terminalRestartBtn = document.getElementById('terminal-restart-btn')!;

  wireIpcListeners();
  wireHeaderControls();
  wireResizeHandler();
  warmUpXterm();
  startPolling();
};
