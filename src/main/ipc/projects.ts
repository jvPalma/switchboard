import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { dialog, shell } from 'electron';
import log from 'electron-log';
import { PROJECTS_DIR } from '@main/constants';
import { getMainWindow, notifyRendererProjectsChanged } from '@main/broadcast';
import { registerHandler } from './registry';
import { buildProjectsFromCache, refreshFolder } from '@main/cache/builder';
import { populateCacheViaWorker } from '@main/cache/scanner';
import {
  isCachePopulated, isSearchIndexPopulated,
  getSetting, setSetting,
  deleteCachedFolder, deleteSearchFolder, deleteSetting,
} from '@main/db';

export function register(): void {
  registerHandler('browse-folder', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Folder',
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  registerHandler('add-project', (projectPath: string) => {
    try {
      const stat = fs.statSync(projectPath);
      if (!stat.isDirectory()) return { error: 'Path is not a directory' };

      // Unhide if previously hidden
      const global = getSetting('global') || {};
      if (global.hiddenProjects && global.hiddenProjects.includes(projectPath)) {
        global.hiddenProjects = global.hiddenProjects.filter((p: string) => p !== projectPath);
        setSetting('global', global);
      }

      const folder = projectPath.replace(/[/_]/g, '-').replace(/^-/, '-');
      const folderPath = path.join(PROJECTS_DIR, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      // Seed a minimal .jsonl so deriveProjectPath can read the cwd
      if (!fs.readdirSync(folderPath).some(f => f.endsWith('.jsonl'))) {
        const seedId = crypto.randomUUID();
        const seedFile = path.join(folderPath, seedId + '.jsonl');
        const now = new Date().toISOString();
        const line = JSON.stringify({
          type: 'user', cwd: projectPath, sessionId: seedId,
          uuid: crypto.randomUUID(), timestamp: now,
          message: { role: 'user', content: 'New project' },
        });
        fs.writeFileSync(seedFile, line + '\n');
      }

      refreshFolder(folder);
      notifyRendererProjectsChanged();

      return { ok: true, folder, projectPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  });

  registerHandler('remove-project', (projectPath: string) => {
    try {
      const global = getSetting('global') || {};
      const hidden: string[] = global.hiddenProjects || [];
      if (!hidden.includes(projectPath)) hidden.push(projectPath);
      global.hiddenProjects = hidden;
      setSetting('global', global);

      const folder = projectPath.replace(/[/_]/g, '-').replace(/^-/, '-');
      deleteCachedFolder(folder);
      deleteSearchFolder(folder);
      deleteSetting('project:' + projectPath);

      notifyRendererProjectsChanged();
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message };
    }
  });

  registerHandler('open-external', (url: string) => {
    log.info('[open-external IPC]', url);
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
  });

  registerHandler('get-projects', (showArchived: boolean) => {
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
  });

  registerHandler('read-file-for-panel', async (filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return { ok: true, content };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });
}
