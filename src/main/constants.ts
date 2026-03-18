import * as path from 'path';
import * as os from 'os';

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
export const PLANS_DIR = path.join(CLAUDE_DIR, 'plans');
export const STATS_CACHE_PATH = path.join(CLAUDE_DIR, 'stats-cache.json');
export const MAX_BUFFER_SIZE = 256 * 1024;
