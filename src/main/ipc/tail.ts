import * as fs from 'fs';
import * as path from 'path';
import { PROJECTS_DIR } from '@main/constants';
import { registerHandler } from './registry';
import { getCachedFolder } from '@main/db';
import { sendToRenderer } from '@main/broadcast';

interface TailState {
  watcher: fs.FSWatcher;
  offset: number;
  sessionId: string;
  filePath: string;
}

let activeTail: TailState | null = null;

const stopActiveTail = (): void => {
  if (!activeTail) return;
  activeTail.watcher.close();
  activeTail = null;
};

export function register(): void {
  registerHandler('tail-session-jsonl', (sessionId: string) => {
    stopActiveTail();

    const folder = getCachedFolder(sessionId);
    if (!folder) return { error: 'Session not found in cache' };

    const jsonlPath = path.join(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
    let offset: number;
    try {
      offset = fs.statSync(jsonlPath).size;
    } catch {
      return { error: 'File not found' };
    }

    const state: TailState = { watcher: null!, offset, sessionId, filePath: jsonlPath };

    const watcher = fs.watch(jsonlPath, (eventType) => {
      if (eventType !== 'change' || !activeTail) return;
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
            sendToRenderer('tail-session-jsonl', sessionId, lines);
          }
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        // File may be temporarily locked during write
      }
    });

    watcher.on('error', stopActiveTail);

    state.watcher = watcher;
    activeTail = state;
    return { ok: true };
  });

  registerHandler('stop-tail-session-jsonl', (sessionId?: string) => {
    if (!sessionId || activeTail?.sessionId === sessionId) {
      stopActiveTail();
    }
    return { ok: true };
  });
}
