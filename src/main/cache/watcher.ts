import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { PROJECTS_DIR } from '@main/constants';
import { getMainWindow, broadcastToWeb, notifyRendererProjectsChanged } from '@main/broadcast';
import { deleteCachedFolder } from '@main/db';
import { refreshFolder } from './builder';
import { activeSessions } from '@main/pty/manager';
import { rekeyMcpServer } from '@main/mcp/server';

let projectsWatcher: fs.FSWatcher | null = null;

// ── Fork / plan-accept detection helpers ──────────────────────────

interface SessionSignals {
  forkedFrom: string | null;
  planContent: boolean;
  slug: string | null;
  parentSessionId: string | null;
}

function readNewSessionSignals(filePath: string): SessionSignals {
  try {
    const head = fs.readFileSync(filePath, 'utf8').slice(0, 8000);
    const lines = head.split('\n').filter(Boolean);
    let forkedFrom: string | null = null;
    let planContent = false;
    let slug: string | null = null;
    let parentSessionId: string | null = null;
    for (const line of lines) {
      const entry = JSON.parse(line);
      if (entry.forkedFrom) forkedFrom = entry.forkedFrom.sessionId as string;
      if (entry.planContent) planContent = true;
      if (entry.slug && !slug) slug = entry.slug as string;
      if (entry.sessionId && !parentSessionId) parentSessionId = entry.sessionId as string;
      if (entry.type === 'user' || entry.type === 'assistant') break;
    }
    return { forkedFrom, planContent, slug, parentSessionId };
  } catch {
    return { forkedFrom: null, planContent: false, slug: null, parentSessionId: null };
  }
}

function readOldSessionTail(filePath: string): { hasExitPlanMode: boolean; slug: string | null } {
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;
    const readSize = Math.min(size, 8192);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, readSize, size - readSize);
    fs.closeSync(fd);
    const tail = buf.toString('utf8');
    const hasExitPlanMode = tail.includes('ExitPlanMode');
    let slug: string | null = null;
    const slugMatches = tail.match(/"slug"\s*:\s*"([^"]+)"/g);
    if (slugMatches) {
      const last = slugMatches[slugMatches.length - 1]!.match(/"slug"\s*:\s*"([^"]+)"/);
      if (last) slug = last[1]!;
    }
    return { hasExitPlanMode, slug };
  } catch {
    return { hasExitPlanMode: false, slug: null };
  }
}

/** Detect fork or plan-accept transitions for active PTY sessions in a folder */
export function detectSessionTransitions(folder: string): void {
  const folderPath = path.join(PROJECTS_DIR, folder);
  let currentFiles: string[];
  try {
    currentFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl'));
  } catch { return; }

  for (const [sessionId, session] of [...activeSessions]) {
    if (session.exited || session.isPlainTerminal || !session.knownJsonlFiles || session.projectFolder !== folder) {
      if (!session.exited && !session.isPlainTerminal && session.forkFrom) {
        log.info(`[fork-detect] skipped session=${sessionId} forkFrom=${session.forkFrom || 'none'} reason=${session.exited ? 'exited' : session.isPlainTerminal ? 'terminal' : !session.knownJsonlFiles ? 'noKnown' : 'folderMismatch(' + session.projectFolder + ' vs ' + folder + ')'}`);
      }
      continue;
    }

    const newFiles = currentFiles.filter(f => !session.knownJsonlFiles!.has(f));

    log.debug(`[detect] session=${sessionId} forkFrom=${session.forkFrom || 'none'} folder=${folder} newFiles=${newFiles.length} knownCount=${session.knownJsonlFiles.size} currentCount=${currentFiles.length}`);

    if (newFiles.length === 0) continue;

    const emptyFiles = new Set<string>();

    for (const newFile of newFiles) {
      const newFilePath = path.join(folderPath, newFile);
      const newId = path.basename(newFile, '.jsonl');
      const signals = readNewSessionSignals(newFilePath);

      if (!signals.forkedFrom && !signals.parentSessionId && !signals.slug && !signals.planContent) {
        emptyFiles.add(newFile);
        log.debug(`[detect] session=${sessionId} skipping empty newFile=${newId}`);
        continue;
      }

      log.debug(`[detect] session=${sessionId} checking newFile=${newId} signals=${JSON.stringify({ forkedFrom: signals.forkedFrom, parentSessionId: signals.parentSessionId, slug: signals.slug })} forkFrom=${session.forkFrom || 'none'}`);

      let matched = false;

      // Fork: forkedFrom.sessionId matches this active PTY or the session it was forked from
      if (signals.forkedFrom === sessionId || (session.forkFrom && signals.forkedFrom === session.forkFrom)) {
        matched = true;
      }
      // --fork-session: new file's parentSessionId matches the forkFrom source
      if (!matched && session.forkFrom && signals.parentSessionId === session.forkFrom && newId !== session.forkFrom) {
        matched = true;
      }

      // Plan-accept: shared slug + planContent + old session has ExitPlanMode
      if (!matched && signals.planContent && signals.slug) {
        const oldFilePath = path.join(folderPath, sessionId + '.jsonl');
        const oldTail = readOldSessionTail(oldFilePath);
        if (oldTail.hasExitPlanMode && oldTail.slug === signals.slug) {
          try {
            const oldMtime = fs.statSync(oldFilePath).mtimeMs;
            const newMtime = fs.statSync(newFilePath).mtimeMs;
            if (Math.abs(newMtime - oldMtime) < 30000) {
              matched = true;
            }
          } catch { /* ignore */ }
        }
      }

      if (matched) {
        log.info(`[session-transition] ${sessionId} → ${newId} (${signals.forkedFrom || session.forkFrom ? 'fork' : 'plan-accept'})`);
        session.knownJsonlFiles = new Set(currentFiles);
        session.realSessionId = newId;
        if (signals.slug) session.sessionSlug = signals.slug;
        activeSessions.delete(sessionId);
        activeSessions.set(newId, session);
        rekeyMcpServer(sessionId, newId);
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('session-forked', sessionId, newId);
        }
        broadcastToWeb('session-forked', sessionId, newId);
        break; // Only one transition per session per flush
      }
    }

    // Update known files, but exclude empty ones so they get rechecked next cycle
    const updated = new Set(currentFiles);
    for (const f of emptyFiles) updated.delete(f);
    session.knownJsonlFiles = updated;
  }
}

// ── fs.watch on projects directory ────────────────────────────────

export function startProjectsWatcher(): void {
  if (!fs.existsSync(PROJECTS_DIR)) return;

  const pendingFolders = new Set<string>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function flushChanges(): void {
    debounceTimer = null;
    const folders = new Set(pendingFolders);
    pendingFolders.clear();

    let changed = false;
    for (const folder of folders) {
      const folderPath = path.join(PROJECTS_DIR, folder);
      if (fs.existsSync(folderPath)) {
        detectSessionTransitions(folder);
        refreshFolder(folder);
      } else {
        deleteCachedFolder(folder);
      }
      changed = true;
    }

    if (changed) {
      notifyRendererProjectsChanged();
    }
  }

  try {
    projectsWatcher = fs.watch(PROJECTS_DIR, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;

      const parts = filename.split(path.sep);
      const folder = parts[0];
      if (!folder || folder === '.git') return;

      const basename = parts[parts.length - 1];
      if (parts.length === 1) {
        pendingFolders.add(folder);
      } else if (basename?.endsWith('.jsonl')) {
        pendingFolders.add(folder);
      } else {
        return;
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushChanges, 500);
    });

    projectsWatcher.on('error', (err) => {
      console.error('Projects watcher error:', err);
    });
  } catch (err) {
    console.error('Failed to start projects watcher:', err);
  }
}

export function stopProjectsWatcher(): void {
  if (projectsWatcher) {
    projectsWatcher.close();
    projectsWatcher = null;
  }
}
