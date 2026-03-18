import * as fs from 'fs';
import * as path from 'path';
import { PROJECTS_DIR } from '@main/constants';
import {
  getAllMeta, getAllCached, getCachedByFolder,
  upsertCachedSessions, deleteCachedSession, deleteCachedFolder,
  setFolderMeta, getSetting,
  upsertSearchEntries, deleteSearchSession,
  setName, getFolderIndexMtimeMs,
} from '@main/db';
import type { SessionUpsertData, SearchEntry } from '@main/db';

// TODO: import from @shared/types when available
export interface ProjectSession {
  sessionId: string;
  summary: string;
  firstPrompt: string;
  created: string;
  modified: string;
  messageCount: number;
  projectPath: string;
  slug: string | null;
  name: string | null;
  starred: number;
  archived: number;
}

export interface Project {
  folder: string;
  projectPath: string;
  sessions: ProjectSession[];
}

/** Derive the real project path by reading cwd from the first JSONL entry in the folder */
export function deriveProjectPath(folderPath: string, _folder: string): string | null {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    // Check direct .jsonl files first
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        const firstLine = fs.readFileSync(path.join(folderPath, e.name), 'utf8').split('\n')[0];
        if (firstLine) {
          const parsed = JSON.parse(firstLine);
          if (parsed.cwd) return parsed.cwd as string;
        }
      }
    }
    // Check session subdirectories (UUID folders with subagent .jsonl files)
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
            if (agentFiles[0]) jsonlPath = path.join(subDir, 'subagents', agentFiles[0]);
          }
          if (jsonlPath) {
            const firstLine = fs.readFileSync(jsonlPath, 'utf8').split('\n')[0];
            if (firstLine) {
              const parsed = JSON.parse(firstLine);
              if (parsed.cwd) return parsed.cwd as string;
            }
          }
        }
      } catch { /* skip unreadable subdirs */ }
    }
  } catch { /* skip unreadable folders */ }
  return null;
}

/** Parse a single .jsonl file into a session object (or null if invalid) */
export function readSessionFile(
  filePath: string,
  folder: string,
  projectPath: string,
): SessionUpsertData | null {
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
      const entry = JSON.parse(line);
      if (entry.slug && !slug) slug = entry.slug as string;
      if (entry.type === 'custom-title' && entry.customTitle) {
        customTitle = entry.customTitle as string;
      }
      if (entry.type === 'user' || entry.type === 'assistant' ||
          (entry.type === 'message' && (entry.role === 'user' || entry.role === 'assistant'))) {
        messageCount++;
      }
      const msg = entry.message;
      const text: string = typeof msg === 'string' ? msg :
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
export function refreshFolder(folder: string): void {
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
  const sessionsToUpsert: SessionUpsertData[] = [];
  const searchEntriesToUpsert: SearchEntry[] = [];
  const namesToSet: { id: string; name: string }[] = [];
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

  // Batch all DB writes
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
}

/** Build projects response from cached data */
export function buildProjectsFromCache(showArchived: boolean): Project[] {
  const metaMap = getAllMeta();
  const cachedRows = getAllCached();
  const global = getSetting('global') || {};
  const hiddenProjects = new Set<string>(global.hiddenProjects || []);

  const folderMap = new Map<string, Project>();
  for (const row of cachedRows) {
    if (hiddenProjects.has(row.projectPath)) continue;
    if (!folderMap.has(row.folder)) {
      folderMap.set(row.folder, { folder: row.folder, projectPath: row.projectPath, sessions: [] });
    }
    const meta = metaMap.get(row.sessionId);
    const s: ProjectSession = {
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
    folderMap.get(row.folder)!.sessions.push(s);
  }

  // Include empty project directories
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
  } catch { /* ignore */ }

  const projects: Project[] = [];
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
}
