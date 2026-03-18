#!/usr/bin/env node
/**
 * Standalone web server for Switchboard (no Electron required).
 *
 * Usage:
 *   node dist/web.js              # default port 8081
 *   PORT=3000 node dist/web.js    # custom port
 */

import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { createWebServer } from './server';
import type { Logger, HandlerRegistry, WebServerInstance } from './server';

// TODO: Import from @shared/types/ once created
interface SessionData {
  sessionId: string;
  folder: string;
  projectPath: string;
  summary: string;
  firstPrompt: string;
  created: string;
  modified: string;
  messageCount: number;
  textContent: string;
  slug: string | null;
  customTitle: string | null;
}

interface CachedRow extends SessionData {
  name?: string | null;
  starred?: number;
  archived?: number;
}

interface MetaRow {
  name: string | null;
  starred: number;
  archived: number;
}

interface SearchEntry {
  id: string;
  type: string;
  folder: string | null;
  title: string;
  body: string;
}

interface MemoryInfo {
  type: string;
  label: string;
  filename: string;
  filePath: string;
  modified: string;
}

interface PlanInfo {
  filename: string;
  title: string;
  modified: string;
}

interface ProjectGroup {
  folder: string;
  projectPath: string;
  sessions: Array<CachedRow & { name: string | null; starred: number; archived: number }>;
}

interface SessionOptions {
  type?: string;
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

interface ActiveSession {
  pty: PtyProcess;
  rendererAttached: boolean;
  exited: boolean;
  outputBuffer: string[];
  outputBufferSize: number;
  altScreen: boolean;
  projectPath: string;
  firstResize: boolean;
  isPlainTerminal: boolean;
  mcpServer: McpServer | null;
  _suppressBuffer?: boolean;
}

// TODO: Replace with proper types from node-pty / mcp-bridge once migrated
interface PtyProcess {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (info: { exitCode: number }) => void) => void;
  _isDisposed?: boolean;
}

interface PtyModule {
  spawn: (shell: string, args: string[], options: Record<string, unknown>) => PtyProcess;
}

interface McpServer {
  port: number;
}

interface McpWindowProxy {
  isDestroyed: () => boolean;
  webContents: {
    send: (channel: string, ...args: unknown[]) => void;
  };
}

// TODO: Import from @db/ once migrated
interface DbModule {
  getAllMeta: () => Map<string, MetaRow>;
  toggleStar: (sessionId: string) => number;
  setName: (sessionId: string, name: string | null) => void;
  setArchived: (sessionId: string, archived: number) => void;
  isCachePopulated: () => boolean;
  getAllCached: () => CachedRow[];
  getCachedByFolder: (folder: string) => CachedRow[];
  getCachedFolder: (sessionId: string) => string | null;
  getCachedSession: (sessionId: string) => CachedRow | null;
  upsertCachedSessions: (sessions: SessionData[]) => void;
  deleteCachedSession: (sessionId: string) => void;
  deleteCachedFolder: (folder: string) => void;
  getFolderMeta: (folder: string) => unknown;
  getAllFolderMeta: () => unknown;
  setFolderMeta: (folder: string, projectPath: string | null, mtimeMs: number) => void;
  upsertSearchEntries: (entries: SearchEntry[]) => void;
  updateSearchTitle: (id: string, type: string, title: string) => void;
  deleteSearchSession: (sessionId: string) => void;
  deleteSearchFolder: (folder: string) => void;
  deleteSearchType: (type: string) => void;
  searchByType: (type: string, query: string, limit: number) => unknown[];
  isSearchIndexPopulated: () => boolean;
  getSetting: (key: string) => Record<string, unknown> | null;
  setSetting: (key: string, value: unknown) => void;
  deleteSetting: (key: string) => void;
  closeDb: () => void;
}

interface McpBridgeModule {
  startMcpServer: (sessionId: string, paths: string[], proxy: McpWindowProxy, log: Logger) => Promise<McpServer>;
  shutdownMcpServer: (sessionId: string) => void;
  shutdownAll: () => void;
  resolvePendingDiff: (sessionId: string, diffId: string, action: string, editedContent: string | null) => void;
}

// --- Lazy-load node-pty with graceful degradation ---
let pty: PtyModule | undefined;
try { pty = require('node-pty') as PtyModule; } catch {
  console.warn('[warn] node-pty not available — terminal support disabled. Run npm rebuild to fix.');
}

// --- External JS modules (not yet migrated) ---
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { startMcpServer, shutdownMcpServer, shutdownAll: shutdownAllMcp, resolvePendingDiff } = require('../../mcp-bridge') as McpBridgeModule;

const {
  getAllMeta, toggleStar, setName, setArchived,
  isCachePopulated, getAllCached, getCachedByFolder, getCachedFolder, getCachedSession, upsertCachedSessions,
  deleteCachedSession, deleteCachedFolder,
  setFolderMeta,
  upsertSearchEntries, updateSearchTitle, deleteSearchSession, deleteSearchFolder, deleteSearchType,
  searchByType, isSearchIndexPopulated,
  getSetting, setSetting, deleteSetting,
  closeDb,
} = require('../../db') as DbModule;

const { getFolderIndexMtimeMs } = require('../../folder-index-state') as { getFolderIndexMtimeMs: (folderPath: string) => number };

// --- Constants ---
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const STATS_CACHE_PATH = path.join(CLAUDE_DIR, 'stats-cache.json');
const MAX_BUFFER_SIZE = 256 * 1024;

// --- Logger (console-based, matches electron-log API) ---
const log: Logger = {
  info: (...args: unknown[]) => console.log('[info]', ...args),
  warn: (...args: unknown[]) => console.warn('[warn]', ...args),
  error: (...args: unknown[]) => console.error('[error]', ...args),
  debug: (...args: unknown[]) => { if (process.env.DEBUG) console.log('[debug]', ...args); },
};

// --- State ---
const activeSessions = new Map<string, ActiveSession>();
let webServer: WebServerInstance | null = null;
let populatingCache = false;

// --- Tail state ---
interface WebTailState {
  watcher: fs.FSWatcher;
  offset: number;
  sessionId: string;
  filePath: string;
}
let activeTailState: WebTailState | null = null;

// Clean env for child processes — strip Electron internals that cause nested
// Electron apps (or node-pty inside them) to malfunction.
const cleanPtyEnv: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    !k.startsWith('ELECTRON_') &&
    !k.startsWith('GOOGLE_API_KEY') &&
    k !== 'NODE_OPTIONS' &&
    k !== 'ORIGINAL_XDG_CURRENT_DESKTOP'
  )
) as Record<string, string>;

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

const broadcast = (msg: unknown): void => {
  if (webServer) webServer.broadcast(msg);
};

const broadcastToWeb = (type: string, ...args: unknown[]): void => {
  broadcast({ type, args });
};

const sendStatus = (text: string, type?: string): void => {
  if (text) log.info(`[status] (${type || 'info'}) ${text}`);
  broadcastToWeb('status-update', text, type || 'info');
};

const notifyRendererProjectsChanged = (): void => {
  broadcastToWeb('projects-changed');
};

// ---------------------------------------------------------------------------
// Session / cache helpers (copied from main.js)
// ---------------------------------------------------------------------------

// TODO: Replace with @shared/types/jsonl-entry once created
interface JsonlEntry {
  cwd?: string;
  slug?: string;
  type?: string;
  role?: string;
  customTitle?: string;
  message?: string | { content?: string | Array<{ text?: string }> };
}

const deriveProjectPath = (folderPath: string): string | null => {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        const firstLine = fs.readFileSync(path.join(folderPath, e.name), 'utf8').split('\n')[0];
        if (firstLine) {
          const parsed = JSON.parse(firstLine) as JsonlEntry;
          if (parsed.cwd) return parsed.cwd;
        }
      }
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const subDir = path.join(folderPath, e.name);
      try {
        const subFiles = fs.readdirSync(subDir, { withFileTypes: true });
        for (const sf of subFiles) {
          let jsonlPath: string | undefined;
          if (sf.isFile() && sf.name.endsWith('.jsonl')) {
            jsonlPath = path.join(subDir, sf.name);
          } else if (sf.isDirectory() && sf.name === 'subagents') {
            const agentFiles = fs.readdirSync(path.join(subDir, 'subagents')).filter(f => f.endsWith('.jsonl'));
            if (agentFiles.length > 0) jsonlPath = path.join(subDir, 'subagents', agentFiles[0]!);
          }
          if (jsonlPath) {
            const firstLine = fs.readFileSync(jsonlPath, 'utf8').split('\n')[0];
            if (firstLine) {
              const parsed = JSON.parse(firstLine) as JsonlEntry;
              if (parsed.cwd) return parsed.cwd;
            }
          }
        }
      } catch { /* ignore subdirectory errors */ }
    }
  } catch { /* ignore top-level errors */ }
  return null;
};

const readSessionFile = (filePath: string, folder: string, projectPath: string): SessionData | null => {
  const sessionId = path.basename(filePath, '.jsonl');
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    let summary = '';
    let messageCount = 0;
    let textContent = '';
    let slug: string | null = null;
    let customTitle: string | null = null;
    for (const line of lines) {
      const entry = JSON.parse(line) as JsonlEntry;
      if (entry.slug && !slug) slug = entry.slug;
      if (entry.type === 'custom-title' && entry.customTitle) {
        customTitle = entry.customTitle;
      }
      if (entry.type === 'user' || entry.type === 'assistant' ||
          (entry.type === 'message' && (entry.role === 'user' || entry.role === 'assistant'))) {
        messageCount++;
      }
      const msg = entry.message;
      const text = typeof msg === 'string' ? msg :
        (typeof msg?.content === 'string' ? msg.content :
        ((msg?.content as Array<{ text?: string }> | undefined)?.[0]?.text || ''));
      if (!summary && (entry.type === 'user' || (entry.type === 'message' && entry.role === 'user'))) {
        if (text) summary = text.slice(0, 120);
      }
      if (text && textContent.length < 8000) {
        textContent += text.slice(0, 500) + '\n';
      }
    }
    if (!summary || messageCount < 1) return null;
    return {
      sessionId, folder, projectPath,
      summary, firstPrompt: summary,
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      messageCount, textContent, slug, customTitle,
    };
  } catch {
    return null;
  }
};

const refreshFolder = (folder: string): void => {
  const folderPath = path.join(PROJECTS_DIR, folder);
  if (!fs.existsSync(folderPath)) {
    deleteCachedFolder(folder);
    return;
  }

  const projectPath = deriveProjectPath(folderPath);
  if (!projectPath) {
    setFolderMeta(folder, null, getFolderIndexMtimeMs(folderPath));
    return;
  }

  const cachedSessions = getCachedByFolder(folder);
  const cachedMap = new Map<string, string>();
  for (const row of cachedSessions) {
    cachedMap.set(row.sessionId, row.modified);
  }

  let jsonlFiles: string[];
  try {
    jsonlFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl'));
  } catch { return; }

  const currentIds = new Set<string>();

  const sessionsToUpsert: SessionData[] = [];
  const searchEntriesToUpsert: SearchEntry[] = [];
  const namesToSet: Array<{ id: string; name: string }> = [];
  const sessionsToDelete: string[] = [];

  for (const file of jsonlFiles) {
    const filePath = path.join(folderPath, file);
    const sessionId = path.basename(file, '.jsonl');
    currentIds.add(sessionId);

    let fileMtime: string;
    try { fileMtime = fs.statSync(filePath).mtime.toISOString(); } catch { continue; }

    if (cachedMap.has(sessionId) && cachedMap.get(sessionId) === fileMtime) {
      continue;
    }

    const s = readSessionFile(filePath, folder, projectPath);
    if (s) {
      sessionsToUpsert.push(s);
      searchEntriesToUpsert.push({
        id: s.sessionId, type: 'session', folder: s.folder,
        title: s.summary, body: s.textContent,
      });
      if (s.customTitle) namesToSet.push({ id: s.sessionId, name: s.customTitle });
    }
  }

  for (const sessionId of cachedMap.keys()) {
    if (!currentIds.has(sessionId)) {
      sessionsToDelete.push(sessionId);
    }
  }

  if (sessionsToUpsert.length > 0) {
    upsertCachedSessions(sessionsToUpsert);
  }
  for (const entry of searchEntriesToUpsert) {
    deleteSearchSession(entry.id);
  }
  if (searchEntriesToUpsert.length > 0) {
    upsertSearchEntries(searchEntriesToUpsert);
  }
  for (const { id, name } of namesToSet) {
    setName(id, name);
  }
  for (const sessionId of sessionsToDelete) {
    deleteCachedSession(sessionId);
    deleteSearchSession(sessionId);
  }

  setFolderMeta(folder, projectPath, getFolderIndexMtimeMs(folderPath));
};

const buildProjectsFromCache = (showArchived: boolean): ProjectGroup[] => {
  const metaMap = getAllMeta();
  const cachedRows = getAllCached();
  const global = (getSetting('global') || {}) as Record<string, unknown>;
  const hiddenProjects = new Set((global.hiddenProjects as string[] | undefined) || []);

  const folderMap = new Map<string, ProjectGroup>();
  for (const row of cachedRows) {
    if (hiddenProjects.has(row.projectPath)) continue;
    if (!folderMap.has(row.folder)) {
      folderMap.set(row.folder, { folder: row.folder, projectPath: row.projectPath, sessions: [] });
    }
    const meta = metaMap.get(row.sessionId);
    const s = {
      ...row,
      name: meta?.name || null,
      starred: meta?.starred || 0,
      archived: meta?.archived || 0,
    };
    if (!showArchived && s.archived) continue;
    folderMap.get(row.folder)!.sessions.push(s);
  }

  try {
    const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.git');
    for (const d of dirs) {
      if (!folderMap.has(d.name)) {
        const projectPath = deriveProjectPath(path.join(PROJECTS_DIR, d.name));
        if (projectPath && !hiddenProjects.has(projectPath)) {
          folderMap.set(d.name, { folder: d.name, projectPath, sessions: [] });
        }
      }
    }
  } catch { /* ignore readdir errors */ }

  const projects: ProjectGroup[] = [];
  for (const proj of folderMap.values()) {
    proj.sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    projects.push(proj);
  }

  projects.sort((a, b) => {
    if (a.sessions.length === 0 && b.sessions.length > 0) return 1;
    if (b.sessions.length === 0 && a.sessions.length > 0) return -1;
    const aDate = a.sessions[0]?.modified || '';
    const bDate = b.sessions[0]?.modified || '';
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  return projects;
};

interface WorkerProgressMessage {
  type: 'progress';
  text: string;
}

interface WorkerResultMessage {
  ok: boolean;
  error?: string;
  results?: Array<{
    folder: string;
    projectPath: string;
    sessions: SessionData[];
    indexMtimeMs: number;
  }>;
}

type WorkerMessage = WorkerProgressMessage | WorkerResultMessage;

const populateCacheViaWorker = (): void => {
  if (populatingCache) return;
  populatingCache = true;
  sendStatus('Scanning projects\u2026', 'active');

  const worker = new Worker(path.join(__dirname, '..', 'workers', 'scan-projects.js'), {
    workerData: { projectsDir: PROJECTS_DIR },
  });

  worker.on('message', (msg: WorkerMessage) => {
    if ('type' in msg && msg.type === 'progress') {
      sendStatus(msg.text, 'active');
      return;
    }

    const result = msg as WorkerResultMessage;
    if (!result.ok) {
      console.error('Worker scan error:', result.error);
      sendStatus('Scan failed: ' + (result.error ?? 'unknown'), 'error');
      populatingCache = false;
      return;
    }

    const results = result.results!;
    sendStatus(`Indexing ${results.length} projects\u2026`, 'active');

    let sessionCount = 0;
    for (const { folder, projectPath, sessions, indexMtimeMs } of results) {
      deleteCachedFolder(folder);
      deleteSearchFolder(folder);
      if (sessions.length > 0) {
        sessionCount += sessions.length;
        upsertCachedSessions(sessions);
        for (const s of sessions) {
          if (s.customTitle) setName(s.sessionId, s.customTitle);
        }
        upsertSearchEntries(sessions.map(s => ({
          id: s.sessionId, type: 'session', folder: s.folder,
          title: (s.customTitle ? s.customTitle + ' ' : '') + s.summary,
          body: s.textContent,
        })));
      }
      setFolderMeta(folder, projectPath, indexMtimeMs);
    }

    populatingCache = false;
    sendStatus(`Indexed ${sessionCount} sessions across ${results.length} projects`, 'done');
    setTimeout(() => sendStatus(''), 5000);
    broadcast({ type: 'projects-changed', args: [] });
  });

  worker.on('error', (err: Error) => {
    console.error('Worker error:', err);
    sendStatus('Worker error: ' + err.message, 'error');
    populatingCache = false;
  });

  worker.on('exit', (code: number) => {
    if (populatingCache) {
      populatingCache = false;
      if (code !== 0) {
        sendStatus('Scan worker exited unexpectedly', 'error');
      }
    }
  });
};

const folderToShortPath = (folder: string): string => {
  const parts = folder.replace(/^-/, '').split('-');
  const meaningful = parts.filter(Boolean);
  return meaningful.slice(-2).join('/');
};

// ---------------------------------------------------------------------------
// MCP window proxy (broadcasts only, no Electron window)
// ---------------------------------------------------------------------------

const createMcpWindowProxy = (): McpWindowProxy => ({
  isDestroyed() { return false; },
  webContents: {
    send(channel: string, ...args: unknown[]) {
      broadcastToWeb(channel, ...args);
    },
  },
});

// ---------------------------------------------------------------------------
// Settings defaults
// ---------------------------------------------------------------------------

const SETTING_DEFAULTS: Record<string, unknown> = {
  permissionMode: null,
  dangerouslySkipPermissions: false,
  worktree: false,
  worktreeName: '',
  chrome: false,
  preLaunchCmd: '',
  addDirs: '',
  visibleSessionCount: 5,
  sidebarWidth: 340,
  terminalTheme: 'switchboard',
  mcpEmulation: false,
  webServerEnabled: true,
  webServerPort: 8081,
};

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

const handlers: HandlerRegistry = {
  'get-projects': (showArchived: unknown) => {
    try {
      const needsPopulate = !isCachePopulated() || !isSearchIndexPopulated();
      if (needsPopulate) {
        populateCacheViaWorker();
        return [];
      }
      return buildProjectsFromCache(showArchived as boolean);
    } catch (err) {
      console.error('Error listing projects:', err);
      return [];
    }
  },

  'get-plans': () => {
    try {
      if (!fs.existsSync(PLANS_DIR)) return [];
      const files = fs.readdirSync(PLANS_DIR).filter(f => f.endsWith('.md'));
      const plans: PlanInfo[] = [];
      for (const file of files) {
        const filePath = path.join(PLANS_DIR, file);
        try {
          const stat = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf8');
          const firstLine = content.split('\n').find(l => l.trim());
          const title = firstLine && firstLine.startsWith('# ')
            ? firstLine.slice(2).trim()
            : file.replace(/\.md$/, '');
          plans.push({ filename: file, title, modified: stat.mtime.toISOString() });
        } catch { /* ignore individual file errors */ }
      }
      plans.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

      try {
        deleteSearchType('plan');
        upsertSearchEntries(plans.map(p => ({
          id: p.filename, type: 'plan', folder: null,
          title: p.title,
          body: fs.readFileSync(path.join(PLANS_DIR, p.filename), 'utf8'),
        })));
      } catch { /* ignore FTS errors */ }

      return plans;
    } catch (err) {
      console.error('Error reading plans:', err);
      return [];
    }
  },

  'read-plan': (filename: unknown) => {
    try {
      const filePath = path.join(PLANS_DIR, path.basename(filename as string));
      const content = fs.readFileSync(filePath, 'utf8');
      return { content, filePath };
    } catch (err) {
      console.error('Error reading plan:', err);
      return { content: '', filePath: '' };
    }
  },

  'save-plan': (filePath: unknown, content: unknown) => {
    try {
      const resolved = path.resolve(filePath as string);
      if (!resolved.startsWith(PLANS_DIR)) {
        return { ok: false, error: 'path outside plans directory' };
      }
      fs.writeFileSync(resolved, content as string, 'utf8');
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error saving plan:', err);
      return { ok: false, error: message };
    }
  },

  'get-stats': () => {
    try {
      if (!fs.existsSync(STATS_CACHE_PATH)) return null;
      const raw = fs.readFileSync(STATS_CACHE_PATH, 'utf8');
      return JSON.parse(raw) as unknown;
    } catch (err) {
      console.error('Error reading stats cache:', err);
      return null;
    }
  },

  'get-memories': () => {
    const memories: MemoryInfo[] = [];
    try {
      const globalClaude = path.join(CLAUDE_DIR, 'CLAUDE.md');
      if (fs.existsSync(globalClaude)) {
        const content = fs.readFileSync(globalClaude, 'utf8').trim();
        if (content) {
          const stat = fs.statSync(globalClaude);
          memories.push({
            type: 'global',
            label: 'Global',
            filename: 'CLAUDE.md',
            filePath: globalClaude,
            modified: stat.mtime.toISOString(),
          });
        }
      }

      if (fs.existsSync(PROJECTS_DIR)) {
        const folders = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
          .filter(d => d.isDirectory() && d.name !== '.git')
          .map(d => d.name);

        for (const folder of folders) {
          const shortPath = folderToShortPath(folder);
          const folderPath = path.join(PROJECTS_DIR, folder);

          const claudeMd = path.join(folderPath, 'CLAUDE.md');
          if (fs.existsSync(claudeMd)) {
            const content = fs.readFileSync(claudeMd, 'utf8').trim();
            if (content) {
              const stat = fs.statSync(claudeMd);
              memories.push({
                type: 'project',
                label: shortPath,
                filename: 'CLAUDE.md',
                filePath: claudeMd,
                modified: stat.mtime.toISOString(),
              });
            }
          }

          const memoryMd = path.join(folderPath, 'memory', 'MEMORY.md');
          if (fs.existsSync(memoryMd)) {
            const content = fs.readFileSync(memoryMd, 'utf8').trim();
            if (content) {
              const stat = fs.statSync(memoryMd);
              memories.push({
                type: 'auto',
                label: shortPath,
                filename: 'MEMORY.md',
                filePath: memoryMd,
                modified: stat.mtime.toISOString(),
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Error scanning memories:', err);
    }

    try {
      deleteSearchType('memory');
      upsertSearchEntries(memories.map(m => ({
        id: m.filePath, type: 'memory', folder: null,
        title: m.label + ' ' + m.filename,
        body: fs.readFileSync(m.filePath, 'utf8'),
      })));
    } catch { /* ignore FTS errors */ }

    return memories;
  },

  'read-memory': (filePath: unknown) => {
    try {
      const resolved = path.resolve(filePath as string);
      if (!resolved.startsWith(CLAUDE_DIR)) {
        return '';
      }
      return fs.readFileSync(resolved, 'utf8');
    } catch (err) {
      console.error('Error reading memory file:', err);
      return '';
    }
  },

  'search': (type: unknown, query: unknown) => {
    return searchByType(type as string, query as string, 50);
  },

  'get-setting': (key: unknown) => {
    return getSetting(key as string);
  },

  'set-setting': (key: unknown, value: unknown) => {
    setSetting(key as string, value);
    return { ok: true };
  },

  'delete-setting': (key: unknown) => {
    deleteSetting(key as string);
    return { ok: true };
  },

  'get-effective-settings': (projectPath: unknown) => {
    const global = (getSetting('global') || {}) as Record<string, unknown>;
    const project = projectPath ? ((getSetting('project:' + (projectPath as string)) || {}) as Record<string, unknown>) : {};
    const effective: Record<string, unknown> = { ...SETTING_DEFAULTS };
    for (const key of Object.keys(SETTING_DEFAULTS)) {
      if (global[key] !== undefined && global[key] !== null) {
        effective[key] = global[key];
      }
      if (project[key] !== undefined && project[key] !== null) {
        effective[key] = project[key];
      }
    }
    return effective;
  },

  'get-active-sessions': () => {
    const active: string[] = [];
    for (const [sessionId, session] of activeSessions) {
      if (!session.exited) active.push(sessionId);
    }
    return active;
  },

  'get-active-terminals': () => {
    const terminals: Array<{ sessionId: string; projectPath: string }> = [];
    for (const [sessionId, session] of activeSessions) {
      if (!session.exited && session.isPlainTerminal) {
        terminals.push({ sessionId, projectPath: session.projectPath });
      }
    }
    return terminals;
  },

  'stop-session': (sessionId: unknown) => {
    const session = activeSessions.get(sessionId as string);
    if (!session || session.exited) return { ok: false, error: 'not running' };
    session.pty.kill();
    return { ok: true };
  },

  'toggle-star': (sessionId: unknown) => {
    const starred = toggleStar(sessionId as string);
    return { starred };
  },

  'rename-session': (sessionId: unknown, name: unknown) => {
    setName(sessionId as string, (name as string) || null);
    const cached = getCachedSession(sessionId as string);
    const summary = cached?.summary || '';
    updateSearchTitle(sessionId as string, 'session', (name ? (name as string) + ' ' : '') + summary);
    return { name: (name as string) || null };
  },

  'archive-session': (sessionId: unknown, archived: unknown) => {
    const val = archived ? 1 : 0;
    setArchived(sessionId as string, val);
    return { archived: val };
  },

  'read-session-jsonl': (sessionId: unknown) => {
    const folder = getCachedFolder(sessionId as string);
    if (!folder) return { error: 'Session not found in cache' };
    const jsonlPath = path.join(PROJECTS_DIR, folder, (sessionId as string) + '.jsonl');
    try {
      const content = fs.readFileSync(jsonlPath, 'utf-8');
      const entries: unknown[] = [];
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try { entries.push(JSON.parse(line) as unknown); } catch { /* skip bad lines */ }
      }
      return { entries };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  },

  'tail-session-jsonl': (sessionId: unknown) => {
    if (activeTailState) {
      activeTailState.watcher.close();
      activeTailState = null;
    }

    const sid = sessionId as string;
    const folder = getCachedFolder(sid);
    if (!folder) return { error: 'Session not found in cache' };

    const jsonlPath = path.join(PROJECTS_DIR, folder, `${sid}.jsonl`);
    let offset: number;
    try {
      offset = fs.statSync(jsonlPath).size;
    } catch {
      return { error: 'File not found' };
    }

    const state: WebTailState = { watcher: null!, offset, sessionId: sid, filePath: jsonlPath };

    const watcher = fs.watch(jsonlPath, (eventType) => {
      if (eventType !== 'change' || !activeTailState) return;
      try {
        const newSize = fs.statSync(state.filePath).size;
        if (newSize <= state.offset) return;
        const fd = fs.openSync(state.filePath, 'r');
        try {
          const buf = Buffer.alloc(newSize - state.offset);
          fs.readSync(fd, buf, 0, buf.length, state.offset);
          state.offset = newSize;
          const lines = buf.toString('utf-8').split('\n').filter(l => l.trim());
          if (lines.length > 0) {
            broadcastToWeb('tail-session-jsonl', sid, lines);
          }
        } finally {
          fs.closeSync(fd);
        }
      } catch { /* file may be locked */ }
    });

    watcher.on('error', () => {
      if (activeTailState?.sessionId === sid) {
        activeTailState.watcher.close();
        activeTailState = null;
      }
    });

    state.watcher = watcher;
    activeTailState = state;
    return { ok: true };
  },

  'stop-tail-session-jsonl': (sessionId?: unknown) => {
    if (!sessionId || activeTailState?.sessionId === (sessionId as string)) {
      if (activeTailState) {
        activeTailState.watcher.close();
        activeTailState = null;
      }
    }
    return { ok: true };
  },

  'read-file-for-panel': async (filePath: unknown) => {
    try {
      const content = fs.readFileSync(filePath as string, 'utf8');
      return { ok: true, content };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },

  'add-project': (projectPath: unknown) => {
    try {
      const pp = projectPath as string;
      const stat = fs.statSync(pp);
      if (!stat.isDirectory()) return { error: 'Path is not a directory' };

      const global = (getSetting('global') || {}) as Record<string, unknown>;
      const hiddenProjects = (global.hiddenProjects as string[] | undefined) || [];
      if (hiddenProjects.includes(pp)) {
        global.hiddenProjects = hiddenProjects.filter(p => p !== pp);
        setSetting('global', global);
      }

      const folder = pp.replace(/[/_]/g, '-').replace(/^-/, '-');
      const folderPath = path.join(PROJECTS_DIR, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      if (!fs.readdirSync(folderPath).some(f => f.endsWith('.jsonl'))) {
        const seedId = crypto.randomUUID();
        const seedFile = path.join(folderPath, seedId + '.jsonl');
        const now = new Date().toISOString();
        const line = JSON.stringify({
          type: 'user', cwd: pp, sessionId: seedId,
          uuid: crypto.randomUUID(), timestamp: now,
          message: { role: 'user', content: 'New project' },
        });
        fs.writeFileSync(seedFile, line + '\n');
      }

      refreshFolder(folder);
      notifyRendererProjectsChanged();

      return { ok: true, folder, projectPath: pp };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  },

  'remove-project': (projectPath: unknown) => {
    try {
      const pp = projectPath as string;
      const global = (getSetting('global') || {}) as Record<string, unknown>;
      const hidden = (global.hiddenProjects as string[] | undefined) || [];
      if (!hidden.includes(pp)) hidden.push(pp);
      global.hiddenProjects = hidden;
      setSetting('global', global);

      const folder = pp.replace(/[/_]/g, '-').replace(/^-/, '-');
      deleteCachedFolder(folder);
      deleteSearchFolder(folder);
      deleteSetting('project:' + pp);

      notifyRendererProjectsChanged();
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  },

  'open-terminal': async (sessionId: unknown, projectPath: unknown, isNew: unknown, sessionOptions: unknown) => {
    const sid = sessionId as string;
    const pp = projectPath as string;
    const opts = (sessionOptions as SessionOptions | undefined) ?? {};

    if (!pty) return { ok: false, error: 'Terminal support unavailable — node-pty not installed. Run npm rebuild.' };

    // Reattach to existing session
    if (activeSessions.has(sid)) {
      const session = activeSessions.get(sid)!;
      session.rendererAttached = true;
      session.firstResize = !session.isPlainTerminal;

      if (session.altScreen && !session.isPlainTerminal) {
        broadcastToWeb('terminal-data', sid, '\x1b[?1049h');
      }

      for (const chunk of session.outputBuffer) {
        broadcastToWeb('terminal-data', sid, chunk);
      }

      if (!session.isPlainTerminal) {
        broadcastToWeb('terminal-data', sid, '\x1b[?25l');
      }

      return { ok: true, reattached: true, mcpActive: !!session.mcpServer };
    }

    // Spawn new PTY
    if (!fs.existsSync(pp)) {
      return { ok: false, error: `project directory no longer exists: ${pp}` };
    }

    const userShell = process.env.SHELL || '/bin/zsh';
    const isPlainTerminal = opts.type === 'terminal';

    let ptyProcess: PtyProcess;
    let mcpServer: McpServer | null = null;
    try {
      if (isPlainTerminal) {
        const claudeShim = 'claude() { echo "\\033[33mTo start a Claude session, use the + button in the sidebar.\\033[0m"; return 1; }; export -f claude 2>/dev/null;';
        ptyProcess = pty.spawn(userShell, ['-l', '-i'], {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: pp,
          env: {
            ...cleanPtyEnv,
            TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'iTerm.app', FORCE_COLOR: '3', ITERM_SESSION_ID: '1',
            CLAUDECODE: '1',
            ENV: claudeShim,
            BASH_ENV: claudeShim,
          },
        });
        setTimeout(() => {
          if (!ptyProcess._isDisposed) {
            try {
              ptyProcess.write(claudeShim + ' clear\n');
            } catch { /* ignore write errors */ }
          }
        }, 300);
      } else {
        let claudeCmd: string;
        if (opts.forkFrom) {
          claudeCmd = `claude --resume "${opts.forkFrom}" --fork-session`;
        } else if (isNew) {
          claudeCmd = `claude --session-id "${sid}"`;
        } else {
          claudeCmd = `claude --resume "${sid}"`;
        }

        if (opts.dangerouslySkipPermissions) {
          claudeCmd += ' --dangerously-skip-permissions';
        } else if (opts.permissionMode) {
          claudeCmd += ` --permission-mode "${opts.permissionMode}"`;
        }
        if (opts.worktree) {
          claudeCmd += ' --worktree';
          if (opts.worktreeName) {
            claudeCmd += ` "${opts.worktreeName}"`;
          }
        }
        if (opts.chrome) {
          claudeCmd += ' --chrome';
        }
        if (opts.addDirs) {
          const dirs = opts.addDirs.split(',').map(d => d.trim()).filter(Boolean);
          for (const dir of dirs) {
            claudeCmd += ` --add-dir "${dir}"`;
          }
        }

        if (opts.preLaunchCmd) {
          claudeCmd = opts.preLaunchCmd + ' ' + claudeCmd;
        }

        if (opts.mcpEmulation !== false) {
          try {
            mcpServer = await startMcpServer(sid, [pp], createMcpWindowProxy(), log);
            claudeCmd += ' --ide';
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`[mcp] Failed to start MCP server for ${sid}: ${message}`);
          }
        }

        const ptyEnv: Record<string, string> = {
          ...cleanPtyEnv,
          TERM: 'xterm-256color', COLORTERM: 'truecolor',
          TERM_PROGRAM: 'iTerm.app', FORCE_COLOR: '3', ITERM_SESSION_ID: '1',
        };
        if (mcpServer) {
          ptyEnv.CLAUDE_CODE_SSE_PORT = String(mcpServer.port);
        }

        ptyProcess = pty.spawn(userShell, ['-l', '-i', '-c', claudeCmd], {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: pp,
          env: ptyEnv,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Error spawning PTY: ${message}` };
    }

    const session: ActiveSession = {
      pty: ptyProcess, rendererAttached: true, exited: false,
      outputBuffer: [], outputBufferSize: 0, altScreen: false,
      projectPath: pp, firstResize: true,
      isPlainTerminal, mcpServer,
    };
    activeSessions.set(sid, session);

    ptyProcess.onData((data: string) => {
      if (data.includes('\x1b[?')) {
        if (data.includes('\x1b[?1049h') || data.includes('\x1b[?47h')) {
          session.altScreen = true;
        }
        if (data.includes('\x1b[?1049l') || data.includes('\x1b[?47l')) {
          session.altScreen = false;
        }
      }

      if (data.includes('\x1b]')) {
        const notifMatch = data.match(/\x1b\]9;([^\x07\x1b]*)(?:\x07|\x1b\\)/);
        if (notifMatch?.[1] && !notifMatch[1].startsWith('4;')) {
          broadcastToWeb('terminal-notification', sid, notifMatch[1]);
        }

        const progressMatch = data.match(/\x1b\]9;4;(\d)(?:;(\d+))?(?:\x07|\x1b\\)/);
        if (progressMatch) {
          const state = parseInt(progressMatch[1]!, 10);
          const percent = progressMatch[2] ? parseInt(progressMatch[2], 10) : -1;
          broadcastToWeb('progress-state', sid, state, percent);
        }
      }

      if (!session._suppressBuffer) {
        session.outputBuffer.push(data);
        session.outputBufferSize += data.length;
        while (session.outputBufferSize > MAX_BUFFER_SIZE && session.outputBuffer.length > 1) {
          session.outputBufferSize -= session.outputBuffer.shift()!.length;
        }
      }

      broadcastToWeb('terminal-data', sid, data);
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      session.exited = true;
      shutdownMcpServer(sid);
      session.mcpServer = null;

      broadcastToWeb('process-exited', sid, exitCode);
      activeSessions.delete(sid);
    });

    return { ok: true, reattached: false, mcpActive: !!mcpServer };
  },

  'browse-folder': () => {
    throw new Error('Not available in web mode');
  },

  'open-external': () => {
    throw new Error('Not available in web mode');
  },

  'updater-check': () => null,
  'updater-download': () => null,
  'updater-install': () => null,
};

// ---------------------------------------------------------------------------
// WebSocket message handler
// ---------------------------------------------------------------------------

interface WsMessage {
  type: string;
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  diffId?: string;
  action?: string;
  editedContent?: string;
}

const handleWebSocketMessage = (msg: Record<string, unknown>): void => {
  const wsMsg = msg as unknown as WsMessage;
  const session = wsMsg.sessionId ? activeSessions.get(wsMsg.sessionId) : undefined;
  switch (wsMsg.type) {
    case 'terminal-input':
      if (session && !session.exited && wsMsg.data) session.pty.write(wsMsg.data);
      break;
    case 'terminal-resize':
      if (session && !session.exited && wsMsg.cols && wsMsg.rows) session.pty.resize(wsMsg.cols, wsMsg.rows);
      break;
    case 'close-terminal':
      if (session && !session.exited) { try { session.pty.kill(); } catch { /* ignore */ } }
      break;
    case 'mcp-diff-response':
      if (wsMsg.sessionId && wsMsg.diffId && wsMsg.action) {
        resolvePendingDiff(wsMsg.sessionId, wsMsg.diffId, wsMsg.action, wsMsg.editedContent || null);
      }
      break;
  }
};

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT || '', 10)
  || ((getSetting('global') || {}) as Record<string, unknown>).webServerPort as number
  || SETTING_DEFAULTS.webServerPort as number;

webServer = createWebServer({
  port,
  host: '0.0.0.0',
  publicDir: path.join(__dirname, '..', 'public'),
  nodeModulesDir: path.join(__dirname, '..', 'node_modules'),
  handlers,
  onWsMessage: handleWebSocketMessage,
  log,
});

webServer.server.on('listening', () => {
  console.log(`\n  Switchboard web UI running at http://localhost:${port}\n`);
});

webServer.server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Error: Port ${port} is already in use. Use PORT=<number> to specify a different port.\n`);
  } else {
    console.error(`\n  Error: ${err.message}\n`);
  }
  process.exit(1);
});

// Populate cache on first start
if (!isCachePopulated()) {
  populateCacheViaWorker();
}

// Graceful shutdown
const shutdown = (): void => {
  console.log('\nShutting down...');
  shutdownAllMcp();
  if (activeTailState) {
    activeTailState.watcher.close();
    activeTailState = null;
  }
  for (const [, session] of activeSessions) {
    if (!session.exited) { try { session.pty.kill(); } catch { /* ignore */ } }
  }
  if (webServer) webServer.stop().catch(() => {});
  closeDb();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
