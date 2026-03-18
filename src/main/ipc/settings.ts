import { registerHandler } from './registry';
import { getSetting, setSetting, deleteSetting } from '@main/db';

export const SETTING_DEFAULTS: Record<string, unknown> = {
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
  webServerPort: 8081,
};

export function register(): void {
  registerHandler('get-setting', (key: string) => {
    return getSetting(key);
  });

  registerHandler('set-setting', (key: string, value: unknown) => {
    setSetting(key, value);
    return { ok: true };
  });

  registerHandler('delete-setting', (key: string) => {
    deleteSetting(key);
    return { ok: true };
  });

  registerHandler('get-effective-settings', (projectPath: string) => {
    const global = getSetting('global') || {};
    const project = projectPath ? (getSetting('project:' + projectPath) || {}) : {};
    const effective: Record<string, unknown> = { ...SETTING_DEFAULTS };
    for (const key of Object.keys(SETTING_DEFAULTS)) {
      if (global[key] !== undefined && global[key] !== null) {
        effective[key] = global[key];
      }
      if (project[key] !== undefined && project[key] !== null) {
        effective[key] = project[key];
      }
    }
    return effective;
  });
}
