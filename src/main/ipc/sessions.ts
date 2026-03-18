import * as fs from 'fs';
import * as path from 'path';
import { ipcMain } from 'electron';
import { PROJECTS_DIR } from '@main/constants';
import { registerHandler } from './registry';
import { resolvePendingDiff } from '@main/mcp/server';
import {
  toggleStar, setName, setArchived,
  getCachedFolder, getCachedSession,
  updateSearchTitle,
} from '@main/db';

export function register(): void {
  registerHandler('toggle-star', (sessionId: string) => {
    const starred = toggleStar(sessionId);
    return { starred };
  });

  registerHandler('rename-session', (sessionId: string, name: string) => {
    setName(sessionId, name || null);
    const cached = getCachedSession(sessionId);
    const summary = cached?.summary || '';
    updateSearchTitle(sessionId, 'session', (name ? name + ' ' : '') + summary);
    return { name: name || null };
  });

  registerHandler('archive-session', (sessionId: string, archived: boolean) => {
    const val = archived ? 1 : 0;
    setArchived(sessionId, val);
    return { archived: val };
  });

  registerHandler('read-session-jsonl', (sessionId: string) => {
    const folder = getCachedFolder(sessionId);
    if (!folder) return { error: 'Session not found in cache' };
    const jsonlPath = path.join(PROJECTS_DIR, folder, sessionId + '.jsonl');
    try {
      const content = fs.readFileSync(jsonlPath, 'utf-8');
      const entries: unknown[] = [];
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try { entries.push(JSON.parse(line)); } catch { /* skip malformed lines */ }
      }
      return { entries };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  });

  // MCP diff response — fire-and-forget
  ipcMain.on('mcp-diff-response', (_event, sessionId: string, diffId: string, action: string, editedContent: string) => {
    resolvePendingDiff(sessionId, diffId, action, editedContent);
  });
}
