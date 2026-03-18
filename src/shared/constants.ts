// Shared path constants and defaults extracted from main.js.
// These are resolved at runtime since they depend on os.homedir().

import path from 'path';
import os from 'os';

/** ~/.claude */
export const CLAUDE_DIR = path.join(os.homedir(), '.claude');

/** ~/.claude/projects — Claude Code session storage root. */
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

/** ~/.claude/plans — User plan files. */
export const PLANS_DIR = path.join(CLAUDE_DIR, 'plans');

/** ~/.claude/ide — MCP bridge lock files. */
export const IDE_DIR = path.join(CLAUDE_DIR, 'ide');

/** ~/.switchboard — Switchboard app data. */
export const DATA_DIR = path.join(os.homedir(), '.switchboard');

/** ~/.switchboard/switchboard.db — SQLite database path. */
export const DB_PATH = path.join(DATA_DIR, 'switchboard.db');

/** ~/.claude/stats-cache.json — Claude CLI stats cache. */
export const STATS_CACHE_PATH = path.join(CLAUDE_DIR, 'stats-cache.json');

/** Maximum output buffer size per PTY session (bytes). */
export const MAX_BUFFER_SIZE = 256 * 1024;

/** Default web server port. */
export const DEFAULT_WEB_PORT = 8081;

/** Default terminal dimensions. */
export const DEFAULT_COLS = 120;
export const DEFAULT_ROWS = 30;

import type { SettingDefaults } from './types/settings';

/** Default values for all user-configurable settings. */
export const SETTING_DEFAULTS: SettingDefaults = {
  permissionMode: null,
  dangerouslySkipPermissions: false,
  worktree: false,
  worktreeName: '',
  chrome: false,
  preLaunchCmd: '',
  addDirs: '',
  visibleSessionCount: 5,
  sidebarWidth: 340,
  terminalTheme: 'switchboard',
  mcpEmulation: false,
  webServerEnabled: true,
  webServerPort: DEFAULT_WEB_PORT,
};
