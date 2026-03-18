import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { getFolderIndexMtimeMs } from '@shared/folder-index-state';

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

interface FolderResult {
  folder: string;
  projectPath: string;
  sessions: SessionData[];
  indexMtimeMs: number;
}

interface WorkerMessage {
  type: 'progress';
  text: string;
}

interface WorkerResultOk {
  ok: true;
  results: FolderResult[];
}

interface WorkerResultErr {
  ok: false;
  error: string;
}

// TODO: Replace with @shared/types/jsonl-entry once created
interface JsonlEntry {
  cwd?: string;
  slug?: string;
  type?: string;
  role?: string;
  customTitle?: string;
  message?: string | { content?: string | Array<{ text?: string }> };
}

const PROJECTS_DIR = (workerData as { projectsDir: string }).projectsDir;

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

const readFolderFromFilesystem = (folder: string): FolderResult | null => {
  const folderPath = path.join(PROJECTS_DIR, folder);
  const projectPath = deriveProjectPath(folderPath);
  if (!projectPath) return null;
  const sessions: SessionData[] = [];
  const indexMtimeMs = getFolderIndexMtimeMs(folderPath);

  try {
    const jsonlFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl'));
    for (const file of jsonlFiles) {
      const filePath = path.join(folderPath, file);
      const sessionId = path.basename(file, '.jsonl');
      const stat = fs.statSync(filePath);
      let summary = '';
      let messageCount = 0;
      let textContent = '';
      let slug: string | null = null;
      let customTitle: string | null = null;
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
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
      } catch { /* ignore parse errors for individual files */ }
      if (!summary || messageCount < 1) continue;
      sessions.push({
        sessionId, folder, projectPath,
        summary, firstPrompt: summary,
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
        messageCount, textContent, slug, customTitle,
      });
    }
  } catch { /* ignore folder read errors */ }

  return { folder, projectPath, sessions, indexMtimeMs };
};

// Scan all folders
try {
  const folders = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '.git')
    .map(d => d.name);

  const results: FolderResult[] = [];
  for (let i = 0; i < folders.length; i++) {
    if (i % 5 === 0 || i === folders.length - 1) {
      parentPort!.postMessage({ type: 'progress', text: `Scanning projects (${i + 1}/${folders.length})\u2026` } satisfies WorkerMessage);
    }
    const result = readFolderFromFilesystem(folders[i]!);
    if (result) results.push(result);
  }
  parentPort!.postMessage({ ok: true, results } satisfies WorkerResultOk);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  parentPort!.postMessage({ ok: false, error: message } satisfies WorkerResultErr);
}
