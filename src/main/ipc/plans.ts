import * as fs from 'fs';
import * as path from 'path';
import { PLANS_DIR, STATS_CACHE_PATH } from '@main/constants';
import { registerHandler } from './registry';
import { deleteSearchType, upsertSearchEntries } from '@main/db';

export function register(): void {
  registerHandler('get-plans', () => {
    try {
      if (!fs.existsSync(PLANS_DIR)) return [];
      const files = fs.readdirSync(PLANS_DIR).filter(f => f.endsWith('.md'));
      const plans: { filename: string; title: string; modified: string }[] = [];
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
        } catch { /* skip unreadable files */ }
      }
      plans.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

      // Index plans for FTS
      try {
        deleteSearchType('plan');
        upsertSearchEntries(plans.map(p => ({
          id: p.filename, type: 'plan', folder: null,
          title: p.title,
          body: fs.readFileSync(path.join(PLANS_DIR, p.filename), 'utf8'),
        })));
      } catch { /* ignore index errors */ }

      return plans;
    } catch (err) {
      console.error('Error reading plans:', err);
      return [];
    }
  });

  registerHandler('read-plan', (filename: string) => {
    try {
      const filePath = path.join(PLANS_DIR, path.basename(filename));
      const content = fs.readFileSync(filePath, 'utf8');
      return { content, filePath };
    } catch (err) {
      console.error('Error reading plan:', err);
      return { content: '', filePath: '' };
    }
  });

  registerHandler('save-plan', (filePath: string, content: string) => {
    try {
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(PLANS_DIR)) {
        return { ok: false, error: 'path outside plans directory' };
      }
      fs.writeFileSync(resolved, content, 'utf8');
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error saving plan:', message);
      return { ok: false, error: message };
    }
  });

  registerHandler('get-stats', () => {
    try {
      if (!fs.existsSync(STATS_CACHE_PATH)) return null;
      const raw = fs.readFileSync(STATS_CACHE_PATH, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('Error reading stats cache:', err);
      return null;
    }
  });
}
