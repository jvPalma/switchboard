import { Worker } from 'worker_threads';
import * as path from 'path';
import { PROJECTS_DIR } from '@main/constants';
import { sendStatus, notifyRendererProjectsChanged } from '@main/broadcast';
import {
  deleteCachedFolder, deleteSearchFolder,
  upsertCachedSessions, upsertSearchEntries,
  setFolderMeta, setName,
} from '@main/db';
import type { SessionUpsertData } from '@main/db';

let populatingCache = false;

interface WorkerResult {
  folder: string;
  projectPath: string;
  sessions: (SessionUpsertData & { customTitle?: string | null })[];
  indexMtimeMs: number;
}

interface WorkerMessage {
  ok?: boolean;
  error?: string;
  type?: string;
  text?: string;
  results?: WorkerResult[];
}

export function populateCacheViaWorker(): void {
  if (populatingCache) return;
  populatingCache = true;
  sendStatus('Scanning projects\u2026', 'active');

  const worker = new Worker(path.join(__dirname, '..', '..', 'workers', 'scan-projects.js'), {
    workerData: { projectsDir: PROJECTS_DIR },
  });

  worker.on('message', (msg: WorkerMessage) => {
    if (msg.type === 'progress') {
      sendStatus(msg.text || '', 'active');
      return;
    }

    if (!msg.ok) {
      console.error('Worker scan error:', msg.error);
      sendStatus('Scan failed: ' + (msg.error || 'unknown'), 'error');
      populatingCache = false;
      return;
    }

    const results = msg.results || [];
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
    notifyRendererProjectsChanged();
  });

  worker.on('error', (err: Error) => {
    console.error('Worker error:', err);
    sendStatus('Worker error: ' + err.message, 'error');
    populatingCache = false;
  });

  worker.on('exit', (code) => {
    if (populatingCache) {
      populatingCache = false;
      if (code !== 0) {
        sendStatus('Scan worker exited unexpectedly', 'error');
      }
    }
  });
}
