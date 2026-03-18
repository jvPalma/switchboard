import * as fs from 'fs';
import * as path from 'path';
import { CLAUDE_DIR, PROJECTS_DIR } from '@main/constants';
import { registerHandler } from './registry';
import { deleteSearchType, upsertSearchEntries } from '@main/db';

interface MemoryEntry {
  type: string;
  label: string;
  filename: string;
  filePath: string;
  modified: string;
}

function folderToShortPath(folder: string): string {
  const parts = folder.replace(/^-/, '').split('-');
  const meaningful = parts.filter(Boolean);
  return meaningful.slice(-2).join('/');
}

export function register(): void {
  registerHandler('get-memories', () => {
    const memories: MemoryEntry[] = [];
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

    // Index memories for FTS
    try {
      deleteSearchType('memory');
      upsertSearchEntries(memories.map(m => ({
        id: m.filePath, type: 'memory', folder: null,
        title: m.label + ' ' + m.filename,
        body: fs.readFileSync(m.filePath, 'utf8'),
      })));
    } catch { /* ignore index errors */ }

    return memories;
  });

  registerHandler('read-memory', (filePath: string) => {
    try {
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(CLAUDE_DIR)) {
        return '';
      }
      return fs.readFileSync(resolved, 'utf8');
    } catch (err) {
      console.error('Error reading memory file:', err);
      return '';
    }
  });
}
