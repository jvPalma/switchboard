#!/usr/bin/env node
/**
 * web.js — Standalone web server for Switchboard (no Electron required).
 *
 * Usage:
 *   node web.js              # default port 8081
 *   PORT=3000 node web.js    # custom port
 */

const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const os = require('os');
let pty;
try { pty = require('node-pty'); } catch {
  console.warn('[warn] node-pty not available — terminal support disabled. Run npm rebuild to fix.');
}
const { createWebServer } = require('./web-server');
const { startMcpServer, shutdownMcpServer, shutdownAll: shutdownAllMcp, resolvePendingDiff } = require('./mcp-bridge');
const {
  getAllMeta, toggleStar, setName, setArchived,
  isCachePopulated, getAllCached, getCachedByFolder, getCachedFolder, getCachedSession, upsertCachedSessions,
  deleteCachedSession, deleteCachedFolder,
  getFolderMeta, getAllFolderMeta, setFolderMeta,
  upsertSearchEntries, updateSearchTitle, deleteSearchSession, deleteSearchFolder, deleteSearchType,
  searchByType, isSearchIndexPopulated,
  getSetting, setSetting, deleteSetting,
  closeDb,
} = require('./db');
const { getFolderIndexMtimeMs } = require('./folder-index-state');

// --- Constants ---
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const STATS_CACHE_PATH = path.join(CLAUDE_DIR, 'stats-cache.json');
const MAX_BUFFER_SIZE = 256 * 1024;

// --- Logger (console-based, matches electron-log API) ---
const log = {
  info: (...args) => console.log('[info]', ...args),
  warn: (...args) => console.warn('[warn]', ...args),
  error: (...args) => console.error('[error]', ...args),
  debug: (...args) => { if (process.env.DEBUG) console.log('[debug]', ...args); },
};

// --- State ---
const activeSessions = new Map();
let webServer = null;
let populatingCache = false;

// Clean env for child processes — strip Electron internals that cause nested
// Electron apps (or node-pty inside them) to malfunction.
const cleanPtyEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    !k.startsWith('ELECTRON_') &&
    !k.startsWith('GOOGLE_API_KEY') &&
    k !== 'NODE_OPTIONS' &&
    k !== 'ORIGINAL_XDG_CURRENT_DESKTOP'
  )
);

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

function broadcast(msg) {
  if (webServer) webServer.broadcast(msg);
}

function broadcastToWeb(type, ...args) {
  broadcast({ type, args });
}

function sendStatus(text, type) {
  if (text) log.info(`[status] (${type || 'info'}) ${text}`);
  broadcastToWeb('status-update', text, type || 'info');
}

function notifyRendererProjectsChanged() {
  broadcastToWeb('projects-changed');
}

// ---------------------------------------------------------------------------
// Session / cache helpers (copied from main.js)
// ---------------------------------------------------------------------------

/** Derive the real project path by reading cwd from the first JSONL entry in the folder */
function deriveProjectPath(folderPath, folder) {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    // Check direct .jsonl files first
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        const firstLine = fs.readFileSync(path.join(folderPath, e.name), 'utf8').split('\n')[0];
        if (firstLine) {
          const parsed = JSON.parse(firstLine);
          if (parsed.cwd) return parsed.cwd;
        }
      }
    }
    // Check session subdirectories (UUID folders with subagent .jsonl files)
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const subDir = path.join(folderPath, e.name);
      try {
        // Look for .jsonl directly in session dir or in subagents/
        const subFiles = fs.readdirSync(subDir, { withFileTypes: true });
        for (const sf of subFiles) {
          let jsonlPath;
          if (sf.isFile() && sf.name.endsWith('.jsonl')) {
            jsonlPath = path.join(subDir, sf.name);
          } else if (sf.isDirectory() && sf.name === 'subagents') {
            const agentFiles = fs.readdirSync(path.join(subDir, 'subagents')).filter(f => f.endsWith('.jsonl'));
            if (agentFiles.length > 0) jsonlPath = path.join(subDir, 'subagents', agentFiles[0]);
          }
          if (jsonlPath) {
            const firstLine = fs.readFileSync(jsonlPath, 'utf8').split('\n')[0];
            if (firstLine) {
              const parsed = JSON.parse(firstLine);
              if (parsed.cwd) return parsed.cwd;
            }
          }
        }
      } catch {}
    }
  } catch {}
  // No cwd found — return null so callers can skip this folder
  return null;
}

/** Parse a single .jsonl file into a session object (or null if invalid) */
function readSessionFile(filePath, folder, projectPath) {
  const sessionId = path.basename(filePath, '.jsonl');
  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    let summary = '';
    let messageCount = 0;
    let textContent = '';
    let slug = null;
    let customTitle = null;
    for (const line of lines) {
      const entry = JSON.parse(line);
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
        (msg?.content?.[0]?.text || ''));
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
}

/** Refresh a single folder incrementally: only re-read changed/new .jsonl files */
function refreshFolder(folder) {
  const folderPath = path.join(PROJECTS_DIR, folder);
  if (!fs.existsSync(folderPath)) {
    deleteCachedFolder(folder);
    return;
  }

  const projectPath = deriveProjectPath(folderPath, folder);
  if (!projectPath) {
    setFolderMeta(folder, null, getFolderIndexMtimeMs(folderPath));
    return;
  }

  // Get what's currently cached for this folder
  const cachedSessions = getCachedByFolder(folder);
  const cachedMap = new Map(); // sessionId -> modified ISO string
  for (const row of cachedSessions) {
    cachedMap.set(row.sessionId, row.modified);
  }

  // Scan current .jsonl files
  let jsonlFiles;
  try {
    jsonlFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl'));
  } catch { return; }

  const currentIds = new Set();
  let changed = false;

  // Collect all changes first, then batch DB writes to minimize lock duration
  const sessionsToUpsert = [];
  const searchEntriesToUpsert = [];
  const namesToSet = [];
  const sessionsToDelete = [];

  for (const file of jsonlFiles) {
    const filePath = path.join(folderPath, file);
    const sessionId = path.basename(file, '.jsonl');
    currentIds.add(sessionId);

    // Check if file mtime changed
    let fileMtime;
    try { fileMtime = fs.statSync(filePath).mtime.toISOString(); } catch { continue; }

    if (cachedMap.has(sessionId) && cachedMap.get(sessionId) === fileMtime) {
      continue; // unchanged, skip
    }

    // File is new or modified — re-read it
    const s = readSessionFile(filePath, folder, projectPath);
    if (s) {
      sessionsToUpsert.push(s);
      searchEntriesToUpsert.push({
        id: s.sessionId, type: 'session', folder: s.folder,
        title: s.summary, body: s.textContent,
      });
      if (s.customTitle) namesToSet.push({ id: s.sessionId, name: s.customTitle });
    }
    changed = true;
  }

  // Remove sessions whose .jsonl files were deleted
  for (const sessionId of cachedMap.keys()) {
    if (!currentIds.has(sessionId)) {
      sessionsToDelete.push(sessionId);
      changed = true;
    }
  }

  // Batch all DB writes to reduce lock contention
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

  // Update folder mtime
  setFolderMeta(folder, projectPath, getFolderIndexMtimeMs(folderPath));
}

/** Build projects response from cached data */
function buildProjectsFromCache(showArchived) {
  const metaMap = getAllMeta();
  const cachedRows = getAllCached();
  const global = getSetting('global') || {};
  const hiddenProjects = new Set(global.hiddenProjects || []);

  // Group by folder
  const folderMap = new Map();
  for (const row of cachedRows) {
    if (hiddenProjects.has(row.projectPath)) continue;
    if (!folderMap.has(row.folder)) {
      folderMap.set(row.folder, { folder: row.folder, projectPath: row.projectPath, sessions: [] });
    }
    const meta = metaMap.get(row.sessionId);
    const s = {
      sessionId: row.sessionId,
      summary: row.summary,
      firstPrompt: row.firstPrompt,
      created: row.created,
      modified: row.modified,
      messageCount: row.messageCount,
      projectPath: row.projectPath,
      slug: row.slug || null,
      name: meta?.name || null,
      starred: meta?.starred || 0,
      archived: meta?.archived || 0,
    };
    if (!showArchived && s.archived) continue;
    folderMap.get(row.folder).sessions.push(s);
  }

  // Include empty project directories (no sessions yet)
  try {
    const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.git');
    for (const d of dirs) {
      if (!folderMap.has(d.name)) {
        const projectPath = deriveProjectPath(path.join(PROJECTS_DIR, d.name), d.name);
        if (projectPath && !hiddenProjects.has(projectPath)) {
          folderMap.set(d.name, { folder: d.name, projectPath, sessions: [] });
        }
      }
    }
  } catch {}

  const projects = [];
  for (const proj of folderMap.values()) {
    proj.sessions.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    projects.push(proj);
  }

  projects.sort((a, b) => {
    // Empty projects go to the bottom
    if (a.sessions.length === 0 && b.sessions.length > 0) return 1;
    if (b.sessions.length === 0 && a.sessions.length > 0) return -1;
    const aDate = a.sessions[0]?.modified || '';
    const bDate = b.sessions[0]?.modified || '';
    return new Date(bDate) - new Date(aDate);
  });

  return projects;
}

/** Populate cache using worker thread (non-blocking) */
function populateCacheViaWorker() {
  if (populatingCache) return;
  populatingCache = true;
  sendStatus('Scanning projects\u2026', 'active');

  const worker = new Worker(path.join(__dirname, 'workers', 'scan-projects.js'), {
    workerData: { projectsDir: PROJECTS_DIR },
  });

  worker.on('message', (msg) => {
    // Progress updates from worker
    if (msg.type === 'progress') {
      sendStatus(msg.text, 'active');
      return;
    }

    if (!msg.ok) {
      console.error('Worker scan error:', msg.error);
      sendStatus('Scan failed: ' + msg.error, 'error');
      populatingCache = false;
      return;
    }

    sendStatus(`Indexing ${msg.results.length} projects\u2026`, 'active');

    // Write results to DB on main thread (fast)
    let sessionCount = 0;
    for (const { folder, projectPath, sessions, indexMtimeMs } of msg.results) {
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
    sendStatus(`Indexed ${sessionCount} sessions across ${msg.results.length} projects`, 'done');
    // Clear status after a few seconds
    setTimeout(() => sendStatus(''), 5000);
    broadcast({ type: 'projects-changed', args: [] });
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
    sendStatus('Worker error: ' + err.message, 'error');
    populatingCache = false;
  });

  // If the worker exits abnormally (SIGSEGV, OOM, uncaught exception) without
  // sending a message, neither the 'message' nor 'error' handler will fire.
  // Reset the flag here to prevent a permanent lockout where the session list
  // stays empty because populateCacheViaWorker() returns immediately.
  worker.on('exit', (code) => {
    if (populatingCache) {
      populatingCache = false;
      if (code !== 0) {
        sendStatus('Scan worker exited unexpectedly', 'error');
      }
    }
  });
}

/** Convert folder name to short path for memories */
function folderToShortPath(folder) {
  // Convert "-Users-home-dev-MyClaude" -> "dev/MyClaude"
  const parts = folder.replace(/^-/, '').split('-');
  // Take last 2 meaningful segments
  const meaningful = parts.filter(Boolean);
  return meaningful.slice(-2).join('/');
}

// ---------------------------------------------------------------------------
// MCP window proxy (broadcasts only, no Electron window)
// ---------------------------------------------------------------------------

function createMcpWindowProxy() {
  return {
    isDestroyed() { return false; },
    webContents: {
      send(channel, ...args) {
        broadcastToWeb(channel, ...args);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Settings defaults
// ---------------------------------------------------------------------------

const SETTING_DEFAULTS = {
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

const handlers = {
  'get-projects': (showArchived) => {
    try {
      const needsPopulate = !isCachePopulated() || !isSearchIndexPopulated();
      if (needsPopulate) {
        populateCacheViaWorker();
        return [];
      }
      return buildProjectsFromCache(showArchived);
    } catch (err) {
      console.error('Error listing projects:', err);
      return [];
    }
  },

  'get-plans': () => {
    try {
      if (!fs.existsSync(PLANS_DIR)) return [];
      const files = fs.readdirSync(PLANS_DIR).filter(f => f.endsWith('.md'));
      const plans = [];
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
        } catch {}
      }
      plans.sort((a, b) => new Date(b.modified) - new Date(a.modified));

      // Index plans for FTS
      try {
        deleteSearchType('plan');
        upsertSearchEntries(plans.map(p => ({
          id: p.filename, type: 'plan', folder: null,
          title: p.title,
          body: fs.readFileSync(path.join(PLANS_DIR, p.filename), 'utf8'),
        })));
      } catch {}

      return plans;
    } catch (err) {
      console.error('Error reading plans:', err);
      return [];
    }
  },

  'read-plan': (filename) => {
    try {
      const filePath = path.join(PLANS_DIR, path.basename(filename));
      const content = fs.readFileSync(filePath, 'utf8');
      return { content, filePath };
    } catch (err) {
      console.error('Error reading plan:', err);
      return { content: '', filePath: '' };
    }
  },

  'save-plan': (filePath, content) => {
    try {
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(PLANS_DIR)) {
        return { ok: false, error: 'path outside plans directory' };
      }
      fs.writeFileSync(resolved, content, 'utf8');
      return { ok: true };
    } catch (err) {
      console.error('Error saving plan:', err);
      return { ok: false, error: err.message };
    }
  },

  'get-stats': () => {
    try {
      if (!fs.existsSync(STATS_CACHE_PATH)) return null;
      const raw = fs.readFileSync(STATS_CACHE_PATH, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('Error reading stats cache:', err);
      return null;
    }
  },

  'get-memories': () => {
    const memories = [];
    try {
      // Global CLAUDE.md
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

      // Per-project CLAUDE.md and memory/MEMORY.md
      if (fs.existsSync(PROJECTS_DIR)) {
        const folders = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
          .filter(d => d.isDirectory() && d.name !== '.git')
          .map(d => d.name);

        for (const folder of folders) {
          const shortPath = folderToShortPath(folder);
          const folderPath = path.join(PROJECTS_DIR, folder);

          // CLAUDE.md in project folder
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

          // memory/MEMORY.md in project folder
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

    // Index memories for FTS
    try {
      deleteSearchType('memory');
      upsertSearchEntries(memories.map(m => ({
        id: m.filePath, type: 'memory', folder: null,
        title: m.label + ' ' + m.filename,
        body: fs.readFileSync(m.filePath, 'utf8'),
      })));
    } catch {}

    return memories;
  },

  'read-memory': (filePath) => {
    try {
      // Validate path is under ~/.claude/
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(CLAUDE_DIR)) {
        return '';
      }
      return fs.readFileSync(resolved, 'utf8');
    } catch (err) {
      console.error('Error reading memory file:', err);
      return '';
    }
  },

  'search': (type, query) => {
    return searchByType(type, query, 50);
  },

  'get-setting': (key) => {
    return getSetting(key);
  },

  'set-setting': (key, value) => {
    setSetting(key, value);
    return { ok: true };
  },

  'delete-setting': (key) => {
    deleteSetting(key);
    return { ok: true };
  },

  'get-effective-settings': (projectPath) => {
    const global = getSetting('global') || {};
    const project = projectPath ? (getSetting('project:' + projectPath) || {}) : {};
    const effective = { ...SETTING_DEFAULTS };
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
    const active = [];
    for (const [sessionId, session] of activeSessions) {
      if (!session.exited) active.push(sessionId);
    }
    return active;
  },

  'get-active-terminals': () => {
    const terminals = [];
    for (const [sessionId, session] of activeSessions) {
      if (!session.exited && session.isPlainTerminal) {
        terminals.push({ sessionId, projectPath: session.projectPath });
      }
    }
    return terminals;
  },

  'stop-session': (sessionId) => {
    const session = activeSessions.get(sessionId);
    if (!session || session.exited) return { ok: false, error: 'not running' };
    session.pty.kill();
    return { ok: true };
  },

  'toggle-star': (sessionId) => {
    const starred = toggleStar(sessionId);
    return { starred };
  },

  'rename-session': (sessionId, name) => {
    setName(sessionId, name || null);
    // Update search index title to include the new name
    const cached = getCachedSession(sessionId);
    const summary = cached?.summary || '';
    updateSearchTitle(sessionId, 'session', (name ? name + ' ' : '') + summary);
    return { name: name || null };
  },

  'archive-session': (sessionId, archived) => {
    const val = archived ? 1 : 0;
    setArchived(sessionId, val);
    return { archived: val };
  },

  'read-session-jsonl': (sessionId) => {
    const folder = getCachedFolder(sessionId);
    if (!folder) return { error: 'Session not found in cache' };
    const jsonlPath = path.join(PROJECTS_DIR, folder, sessionId + '.jsonl');
    try {
      const content = fs.readFileSync(jsonlPath, 'utf-8');
      const entries = [];
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try { entries.push(JSON.parse(line)); } catch {}
      }
      return { entries };
    } catch (err) {
      return { error: err.message };
    }
  },

  'read-file-for-panel': async (filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return { ok: true, content };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  'add-project': (projectPath) => {
    try {
      // Validate the path exists and is a directory
      const stat = fs.statSync(projectPath);
      if (!stat.isDirectory()) return { error: 'Path is not a directory' };

      // Unhide if previously hidden
      const global = getSetting('global') || {};
      if (global.hiddenProjects && global.hiddenProjects.includes(projectPath)) {
        global.hiddenProjects = global.hiddenProjects.filter(p => p !== projectPath);
        setSetting('global', global);
      }

      // Create the corresponding folder in ~/.claude/projects/ so it persists
      const folder = projectPath.replace(/[/_]/g, '-').replace(/^-/, '-');
      const folderPath = path.join(PROJECTS_DIR, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      // Seed a minimal .jsonl so deriveProjectPath can read the cwd
      if (!fs.readdirSync(folderPath).some(f => f.endsWith('.jsonl'))) {
        const seedId = require('crypto').randomUUID();
        const seedFile = path.join(folderPath, seedId + '.jsonl');
        const now = new Date().toISOString();
        const line = JSON.stringify({ type: 'user', cwd: projectPath, sessionId: seedId, uuid: require('crypto').randomUUID(), timestamp: now, message: { role: 'user', content: 'New project' } });
        fs.writeFileSync(seedFile, line + '\n');
      }

      // Immediately index the new folder so it's in cache before frontend renders
      refreshFolder(folder);
      notifyRendererProjectsChanged();

      return { ok: true, folder, projectPath };
    } catch (err) {
      return { error: err.message };
    }
  },

  'remove-project': (projectPath) => {
    try {
      // Add to hidden projects list
      const global = getSetting('global') || {};
      const hidden = global.hiddenProjects || [];
      if (!hidden.includes(projectPath)) hidden.push(projectPath);
      global.hiddenProjects = hidden;
      setSetting('global', global);

      // Clean up DB cache and search index for this folder
      const folder = projectPath.replace(/[/_]/g, '-').replace(/^-/, '-');
      deleteCachedFolder(folder);
      deleteSearchFolder(folder);
      deleteSetting('project:' + projectPath);

      notifyRendererProjectsChanged();
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  },

  'open-terminal': async (sessionId, projectPath, isNew, sessionOptions) => {
    if (!pty) return { ok: false, error: 'Terminal support unavailable — node-pty not installed. Run npm rebuild.' };

    // Reattach to existing session
    if (activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      session.rendererAttached = true;
      session.firstResize = !session.isPlainTerminal;

      // If TUI is in alternate screen mode, send escape to switch into it
      if (session.altScreen && !session.isPlainTerminal) {
        broadcastToWeb('terminal-data', sessionId, '\x1b[?1049h');
      }

      // Send buffered output for reattach
      for (const chunk of session.outputBuffer) {
        broadcastToWeb('terminal-data', sessionId, chunk);
      }

      if (!session.isPlainTerminal) {
        // Hide cursor after buffer replay — the live PTY stream or resize nudge
        // will re-show it at the correct position, avoiding a stale cursor artifact
        broadcastToWeb('terminal-data', sessionId, '\x1b[?25l');
      }

      return { ok: true, reattached: true, mcpActive: !!session.mcpServer };
    }

    // Spawn new PTY
    if (!fs.existsSync(projectPath)) {
      return { ok: false, error: `project directory no longer exists: ${projectPath}` };
    }

    const userShell = process.env.SHELL || '/bin/zsh';
    const isPlainTerminal = sessionOptions?.type === 'terminal';

    let ptyProcess;
    let mcpServer = null;
    try {
      if (isPlainTerminal) {
        // Plain terminal: interactive login shell, no claude command
        const claudeShim = 'claude() { echo "\\033[33mTo start a Claude session, use the + button in the sidebar.\\033[0m"; return 1; }; export -f claude 2>/dev/null;';
        ptyProcess = pty.spawn(userShell, ['-l', '-i'], {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: projectPath,
          env: {
            ...cleanPtyEnv,
            TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'iTerm.app', FORCE_COLOR: '3', ITERM_SESSION_ID: '1',
            CLAUDECODE: '1',
            ENV: claudeShim,
            BASH_ENV: claudeShim,
          },
        });
        // For zsh, ENV/BASH_ENV don't apply — write the function after shell starts
        setTimeout(() => {
          if (!ptyProcess._isDisposed) {
            try {
              ptyProcess.write(claudeShim + ' clear\n');
            } catch {}
          }
        }, 300);
      } else {
        // Build claude command with session options
        let claudeCmd;
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

        // Start MCP server for this session so Claude CLI sends diffs/file opens to Switchboard
        if (sessionOptions?.mcpEmulation !== false) {
          try {
            mcpServer = await startMcpServer(sessionId, [projectPath], createMcpWindowProxy(), log);
            claudeCmd += ' --ide';
          } catch (err) {
            log.error(`[mcp] Failed to start MCP server for ${sessionId}: ${err.message}`);
          }
        }

        const ptyEnv = {
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
          cwd: projectPath,
          env: ptyEnv,
        });
      }
    } catch (err) {
      return { ok: false, error: `Error spawning PTY: ${err.message}` };
    }

    const session = {
      pty: ptyProcess, rendererAttached: true, exited: false,
      outputBuffer: [], outputBufferSize: 0, altScreen: false,
      projectPath, firstResize: true,
      isPlainTerminal, mcpServer,
    };
    activeSessions.set(sessionId, session);

    ptyProcess.onData(data => {
      // Track alternate screen mode
      if (data.includes('\x1b[?')) {
        if (data.includes('\x1b[?1049h') || data.includes('\x1b[?47h')) {
          session.altScreen = true;
        }
        if (data.includes('\x1b[?1049l') || data.includes('\x1b[?47l')) {
          session.altScreen = false;
        }
      }

      // Parse iTerm2 OSC 9 notification
      if (data.includes('\x1b]')) {
        const notifMatch = data.match(/\x1b\]9;([^\x07\x1b]*)(?:\x07|\x1b\\)/);
        if (notifMatch && !notifMatch[1].startsWith('4;')) {
          broadcastToWeb('terminal-notification', sessionId, notifMatch[1]);
        }

        // Parse iTerm2 OSC 9;4 progress sequences
        const progressMatch = data.match(/\x1b\]9;4;(\d)(?:;(\d+))?(?:\x07|\x1b\\)/);
        if (progressMatch) {
          const state = parseInt(progressMatch[1]);
          const percent = progressMatch[2] ? parseInt(progressMatch[2]) : -1;
          broadcastToWeb('progress-state', sessionId, state, percent);
        }
      }

      // Buffer output
      if (!session._suppressBuffer) {
        session.outputBuffer.push(data);
        session.outputBufferSize += data.length;
        while (session.outputBufferSize > MAX_BUFFER_SIZE && session.outputBuffer.length > 1) {
          session.outputBufferSize -= session.outputBuffer.shift().length;
        }
      }

      broadcastToWeb('terminal-data', sessionId, data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      session.exited = true;
      // Clean up MCP server
      shutdownMcpServer(sessionId);
      session.mcpServer = null;

      broadcastToWeb('process-exited', sessionId, exitCode);
      activeSessions.delete(sessionId);
    });

    return { ok: true, reattached: false, mcpActive: !!mcpServer };
  },

  'browse-folder': () => {
    throw new Error('Not available in web mode');
  },

  'open-external': (url) => {
    throw new Error('Not available in web mode');
  },

  'updater-check': () => null,
  'updater-download': () => null,
  'updater-install': () => null,
};

// ---------------------------------------------------------------------------
// WebSocket message handler
// ---------------------------------------------------------------------------

function handleWebSocketMessage(msg) {
  const session = msg.sessionId ? activeSessions.get(msg.sessionId) : null;
  switch (msg.type) {
    case 'terminal-input':
      if (session && !session.exited) session.pty.write(msg.data);
      break;
    case 'terminal-resize':
      if (session && !session.exited) session.pty.resize(msg.cols, msg.rows);
      break;
    case 'close-terminal':
      if (session && !session.exited) { try { session.pty.kill(); } catch {} }
      break;
    case 'mcp-diff-response':
      resolvePendingDiff(msg.sessionId, msg.diffId, msg.action, msg.editedContent || null);
      break;
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT, 10)
  || (getSetting('global') || {}).webServerPort
  || SETTING_DEFAULTS.webServerPort;

webServer = createWebServer({
  port,
  host: '0.0.0.0',
  publicDir: path.join(__dirname, 'public'),
  nodeModulesDir: path.join(__dirname, 'node_modules'),
  handlers,
  onWsMessage: handleWebSocketMessage,
  log,
});

webServer.server.on('listening', () => {
  console.log(`\n  Switchboard web UI running at http://localhost:${port}\n`);
});

webServer.server.on('error', (err) => {
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
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('\nShutting down...');
  shutdownAllMcp();
  for (const [, session] of activeSessions) {
    if (!session.exited) { try { session.pty.kill(); } catch {} }
  }
  if (webServer) webServer.stop().catch(() => {});
  closeDb();
  process.exit(0);
}
